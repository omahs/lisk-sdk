/*
 * Copyright © 2022 Lisk Foundation
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Unless otherwise agreed in a custom licensing agreement with the Lisk Foundation,
 * no part of this software, including this file, may be copied, modified,
 * propagated, or distributed except according to the terms contained in the
 * LICENSE file.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { codec } from '@liskhq/lisk-codec';
import { utils } from '@liskhq/lisk-cryptography';
import { validator } from '@liskhq/lisk-validator';
import { certificateSchema } from '../../../../engine/consensus/certificate_generation/schema';
import { Certificate } from '../../../../engine/consensus/certificate_generation/types';
import {
	CommandExecuteContext,
	CommandVerifyContext,
	NotFoundError,
	VerificationResult,
	VerifyStatus,
} from '../../../../state_machine';
import { BaseCrossChainUpdateCommand } from '../../base_cross_chain_update_command';
import {
	CCMStatusCode,
	CONTEXT_STORE_KEY_CCM_PROCESSING,
	CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED,
	EMPTY_FEE_ADDRESS,
	LIVENESS_LIMIT,
	MODULE_NAME_INTEROPERABILITY,
} from '../../constants';
import {
	CCMProcessedCode,
	CcmProcessedEvent,
	CCMProcessedResult,
} from '../../events/ccm_processed';
import {
	ccmSchema,
	crossChainUpdateTransactionParams,
	sidechainTerminatedCCMParamsSchema,
} from '../../schemas';
import { ChainAccount, ChainAccountStore, ChainStatus } from '../../stores/chain_account';
import { CrossChainMessageContext, CrossChainUpdateTransactionParams } from '../../types';
import { getMainchainID, isInboxUpdateEmpty } from '../../utils';
import { MainchainInteroperabilityInternalMethod } from '../internal_method';

export class SubmitMainchainCrossChainUpdateCommand extends BaseCrossChainUpdateCommand<MainchainInteroperabilityInternalMethod> {
	public async verify(
		context: CommandVerifyContext<CrossChainUpdateTransactionParams>,
	): Promise<VerificationResult> {
		const { params } = context;
		validator.validate<CrossChainUpdateTransactionParams>(
			crossChainUpdateTransactionParams,
			context.params,
		);

		const isLive = await this.internalMethod.isLive(
			context,
			params.sendingChainID,
			context.header.timestamp,
		);
		if (!isLive) {
			throw new Error('The sending chain is not live.');
		}

		const sendingChainAccount = await this.stores
			.get(ChainAccountStore)
			.get(context, params.sendingChainID);

		if (sendingChainAccount.status === ChainStatus.REGISTERED) {
			this._verifyLivenessConditionForRegisteredChains(context);
		}

		await this.verifyCommon(context);

		return {
			status: VerifyStatus.OK,
		};
	}

	public async execute(
		context: CommandExecuteContext<CrossChainUpdateTransactionParams>,
	): Promise<void> {
		const [decodedCCMs, ok] = await this.executeCommon(context, true);
		if (!ok) {
			return;
		}
		const { params } = context;

		try {
			context.contextStore.set(CONTEXT_STORE_KEY_CCM_PROCESSING, true);
			for (let i = 0; i < decodedCCMs.length; i += 1) {
				const ccm = decodedCCMs[i];
				const ccmBytes = params.inboxUpdate.crossChainMessages[i];
				const ccmContext = {
					...context,
					ccm,
				};

				if (ccm.receivingChainID.equals(getMainchainID(context.chainID))) {
					await this.apply(ccmContext);
				} else {
					await this._forward(ccmContext);
				}
				await this.internalMethod.appendToInboxTree(context, params.sendingChainID, ccmBytes);
			}
		} finally {
			context.contextStore.delete(CONTEXT_STORE_KEY_CCM_PROCESSING);
		}
	}

	private async _forward(context: CrossChainMessageContext): Promise<void> {
		const { ccm, logger } = context;
		const encodedCCM = codec.encode(ccmSchema, ccm);
		const ccmID = utils.hash(encodedCCM);

		const valid = await this.verifyCCM(context, ccmID);
		if (!valid) {
			return;
		}
		let receivingChainAccount: ChainAccount;
		try {
			receivingChainAccount = await this.stores
				.get(ChainAccountStore)
				.get(context, ccm.receivingChainID);
			if (receivingChainAccount.status === ChainStatus.REGISTERED) {
				await this.bounce(
					context,
					ccmID,
					encodedCCM.length,
					CCMStatusCode.CHANNEL_UNAVAILABLE,
					CCMProcessedCode.CHANNEL_UNAVAILABLE,
				);
				return;
			}
		} catch (error) {
			if (error instanceof NotFoundError) {
				await this.bounce(
					context,
					ccmID,
					encodedCCM.length,
					CCMStatusCode.CHANNEL_UNAVAILABLE,
					CCMProcessedCode.CHANNEL_UNAVAILABLE,
				);
				return;
			}
			throw error;
		}
		const isLive = await this.internalMethod.isLive(
			context,
			ccm.receivingChainID,
			context.header.timestamp,
		);
		if (!isLive) {
			await this.internalMethod.terminateChainInternal(context, ccm.receivingChainID);
			this.events.get(CcmProcessedEvent).log(context, ccm.sendingChainID, ccm.receivingChainID, {
				ccmID,
				code: CCMProcessedCode.CHANNEL_UNAVAILABLE,
				result: CCMProcessedResult.DISCARDED,
			});
			await this.internalMethod.sendInternal(
				context,
				EMPTY_FEE_ADDRESS,
				MODULE_NAME_INTEROPERABILITY,
				CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED,
				ccm.sendingChainID,
				BigInt(0),
				CCMStatusCode.OK,
				codec.encode(sidechainTerminatedCCMParamsSchema, {
					chainID: ccm.receivingChainID,
					stateRoot: receivingChainAccount.lastCertificate.stateRoot,
				}),
			);
			return;
		}
		const stateSnapshotID = context.stateStore.createSnapshot();
		const eventSnapshotID = context.eventQueue.createSnapshot();

		try {
			for (const [module, method] of this.interoperableCCMethods.entries()) {
				if (method.beforeCrossChainMessageForwarding) {
					logger.debug(
						{
							moduleName: module,
							commandName: ccm.crossChainCommand,
							ccmID: ccmID.toString('hex'),
						},
						'Execute beforeCrossChainCommandExecute',
					);
					await method.beforeCrossChainMessageForwarding(context);
				}
			}
		} catch (error) {
			context.eventQueue.restoreSnapshot(eventSnapshotID);
			context.stateStore.restoreSnapshot(stateSnapshotID);
			logger.info(
				{ err: error as Error, moduleName: ccm.module, commandName: ccm.crossChainCommand },
				'Fail to execute beforeCrossChainCommandExecute.',
			);
			await this.internalMethod.terminateChainInternal(context, ccm.sendingChainID);
			this.events.get(CcmProcessedEvent).log(context, ccm.sendingChainID, ccm.receivingChainID, {
				ccmID,
				code: CCMProcessedCode.INVALID_CCM_BEFORE_CCC_FORWARDING_EXCEPTION,
				result: CCMProcessedResult.DISCARDED,
			});
			return;
		}
		await this.internalMethod.addToOutbox(context, ccm.receivingChainID, ccm);
		this.events.get(CcmProcessedEvent).log(context, ccm.sendingChainID, ccm.receivingChainID, {
			ccmID,
			code: CCMProcessedCode.SUCCESS,
			result: CCMProcessedResult.FORWARDED,
		});
	}

	private _verifyLivenessConditionForRegisteredChains(
		context: CommandVerifyContext<CrossChainUpdateTransactionParams>,
	): void {
		if (context.params.certificate.length === 0 || isInboxUpdateEmpty(context.params.inboxUpdate)) {
			return;
		}
		const certificate = codec.decode<Certificate>(certificateSchema, context.params.certificate);
		if (context.header.timestamp - certificate.timestamp > LIVENESS_LIMIT / 2) {
			throw new Error(
				`The first CCU with a non-empty inbox update cannot contain a certificate older than ${
					LIVENESS_LIMIT / 2
				} seconds.`,
			);
		}
	}
}
