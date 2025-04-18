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
/* eslint-disable max-classes-per-file */

import { bls, utils } from '@liskhq/lisk-cryptography';
import { codec } from '@liskhq/lisk-codec';
import {
	CommandExecuteContext,
	CommandVerifyContext,
	VerifyStatus,
	SubmitMainchainCrossChainUpdateCommand,
	MainchainInteroperabilityModule,
	Transaction,
} from '../../../../../../src';
import {
	ActiveValidator,
	CCMsg,
	ChainAccount,
	ChannelData,
	CrossChainMessageContext,
	CrossChainUpdateTransactionParams,
} from '../../../../../../src/modules/interoperability/types';

import { Certificate } from '../../../../../../src/engine/consensus/certificate_generation/types';
import { certificateSchema } from '../../../../../../src/engine/consensus/certificate_generation/schema';
import * as interopUtils from '../../../../../../src/modules/interoperability/utils';
import {
	ccmSchema,
	crossChainUpdateTransactionParams,
	sidechainTerminatedCCMParamsSchema,
} from '../../../../../../src/modules/interoperability/schemas';
import {
	CCMStatusCode,
	CROSS_CHAIN_COMMAND_NAME_REGISTRATION,
	CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED,
	EMPTY_FEE_ADDRESS,
	HASH_LENGTH,
	MODULE_NAME_INTEROPERABILITY,
} from '../../../../../../src/modules/interoperability/constants';
import { computeValidatorsHash } from '../../../../../../src/modules/interoperability/utils';
import {
	ChainAccountStore,
	ChainStatus,
} from '../../../../../../src/modules/interoperability/stores/chain_account';
import { ChannelDataStore } from '../../../../../../src/modules/interoperability/stores/channel_data';
import { ChainValidatorsStore } from '../../../../../../src/modules/interoperability/stores/chain_validators';
import { PrefixedStateReadWriter } from '../../../../../../src/state_machine/prefixed_state_read_writer';
import { InMemoryPrefixedStateDB } from '../../../../../../src/testing/in_memory_prefixed_state';
import { createStoreGetter } from '../../../../../../src/testing/utils';
import {
	createCrossChainMessageContext,
	createTransactionContext,
} from '../../../../../../src/testing';
import { BaseCCMethod } from '../../../../../../src/modules/interoperability/base_cc_method';
import { BaseCCCommand } from '../../../../../../src/modules/interoperability/base_cc_command';
import {
	CCMProcessedCode,
	CcmProcessedEvent,
	CCMProcessedResult,
} from '../../../../../../src/modules/interoperability/events/ccm_processed';
import { MainchainInteroperabilityInternalMethod } from '../../../../../../src/modules/interoperability/mainchain/internal_method';
import { CROSS_CHAIN_COMMAND_NAME_TRANSFER } from '../../../../../../src/modules/token/constants';

describe('SubmitMainchainCrossChainUpdateCommand', () => {
	const interopMod = new MainchainInteroperabilityModule();

	const chainID = Buffer.alloc(4, 0);
	const senderPublicKey = utils.getRandomBytes(32);
	const messageFeeTokenID = Buffer.alloc(8, 0);
	const defaultCertificateValues: Certificate = {
		blockID: utils.getRandomBytes(20),
		height: 21,
		timestamp: Math.floor(Date.now() / 1000),
		stateRoot: utils.getRandomBytes(HASH_LENGTH),
		validatorsHash: utils.getRandomBytes(48),
		aggregationBits: utils.getRandomBytes(38),
		signature: utils.getRandomBytes(32),
	};

	const defaultNewCertificateThreshold = BigInt(20);
	const defaultSendingChainID = 20;
	const defaultSendingChainIDBuffer = utils.intToBuffer(defaultSendingChainID, 4);
	const defaultCCMs: CCMsg[] = [
		{
			crossChainCommand: CROSS_CHAIN_COMMAND_NAME_REGISTRATION,
			fee: BigInt(0),
			module: MODULE_NAME_INTEROPERABILITY,
			nonce: BigInt(1),
			params: Buffer.alloc(2),
			receivingChainID: Buffer.from([0, 0, 0, 2]),
			sendingChainID: defaultSendingChainIDBuffer,
			status: CCMStatusCode.OK,
		},
		{
			crossChainCommand: CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED,
			fee: BigInt(0),
			module: MODULE_NAME_INTEROPERABILITY,
			nonce: BigInt(1),
			params: Buffer.alloc(2),
			receivingChainID: chainID,
			sendingChainID: defaultSendingChainIDBuffer,
			status: CCMStatusCode.OK,
		},
		{
			crossChainCommand: CROSS_CHAIN_COMMAND_NAME_TRANSFER,
			fee: BigInt(0),
			module: MODULE_NAME_INTEROPERABILITY,
			nonce: BigInt(1),
			params: Buffer.alloc(2),
			receivingChainID: Buffer.from([0, 0, 0, 4]),
			sendingChainID: defaultSendingChainIDBuffer,
			status: CCMStatusCode.OK,
		},
	];
	const defaultCCMsEncoded = defaultCCMs.map(ccm => codec.encode(ccmSchema, ccm));
	const defaultInboxUpdateValue = {
		crossChainMessages: defaultCCMsEncoded,
		messageWitnessHashes: [Buffer.alloc(32)],
		outboxRootWitness: {
			bitmap: Buffer.alloc(1),
			siblingHashes: [Buffer.alloc(32)],
		},
	};
	const defaultTransaction = {
		fee: BigInt(0),
		module: interopMod.name,
		nonce: BigInt(1),
		senderPublicKey,
		signatures: [],
	};

	let stateStore: PrefixedStateReadWriter;
	let encodedDefaultCertificate: Buffer;
	let partnerChainAccount: ChainAccount;
	let partnerChannelAccount: ChannelData;
	let verifyContext: CommandVerifyContext<CrossChainUpdateTransactionParams>;
	let executeContext: CommandExecuteContext<CrossChainUpdateTransactionParams>;
	let mainchainCCUUpdateCommand: SubmitMainchainCrossChainUpdateCommand;
	let params: CrossChainUpdateTransactionParams;
	let activeValidatorsUpdate: ActiveValidator[];
	let sortedActiveValidatorsUpdate: ActiveValidator[];
	let partnerChainStore: ChainAccountStore;
	let partnerChannelStore: ChannelDataStore;
	let partnerValidatorStore: ChainValidatorsStore;

	beforeEach(async () => {
		mainchainCCUUpdateCommand = new SubmitMainchainCrossChainUpdateCommand(
			interopMod.stores,
			interopMod.events,
			new Map(),
			new Map(),
			interopMod['internalMethod'],
		);
		mainchainCCUUpdateCommand.init(
			{
				getMessageFeeTokenID: jest.fn().mockResolvedValue(messageFeeTokenID),
			} as any,
			{
				initializeUserAccount: jest.fn(),
			},
		);
		stateStore = new PrefixedStateReadWriter(new InMemoryPrefixedStateDB());
		activeValidatorsUpdate = [
			{ blsKey: utils.getRandomBytes(48), bftWeight: BigInt(1) },
			{ blsKey: utils.getRandomBytes(48), bftWeight: BigInt(3) },
			{ blsKey: utils.getRandomBytes(48), bftWeight: BigInt(4) },
			{ blsKey: utils.getRandomBytes(48), bftWeight: BigInt(3) },
		].sort((v1, v2) => v2.blsKey.compare(v1.blsKey)); // unsorted list

		const partnerValidators: any = {
			certificateThreshold: BigInt(10),
			activeValidators: activeValidatorsUpdate.map(v => ({
				blsKey: v.blsKey,
				bftWeight: v.bftWeight + BigInt(1),
			})),
		};
		const partnerValidatorsData = {
			activeValidators: [...activeValidatorsUpdate],
			certificateThreshold: BigInt(10),
		};
		const validatorsHash = computeValidatorsHash(
			activeValidatorsUpdate,
			partnerValidators.certificateThreshold,
		);
		encodedDefaultCertificate = codec.encode(certificateSchema, {
			...defaultCertificateValues,
			validatorsHash,
		});

		sortedActiveValidatorsUpdate = [...activeValidatorsUpdate].sort((v1, v2) =>
			v1.blsKey.compare(v2.blsKey),
		);
		partnerChainAccount = {
			lastCertificate: {
				height: 10,
				stateRoot: utils.getRandomBytes(38),
				timestamp: Math.floor(Date.now() / 1000),
				validatorsHash: utils.getRandomBytes(48),
			},
			name: 'sidechain1',
			status: ChainStatus.ACTIVE,
		};
		partnerChannelAccount = {
			inbox: {
				appendPath: [Buffer.alloc(1), Buffer.alloc(1)],
				root: utils.getRandomBytes(38),
				size: 18,
			},
			messageFeeTokenID: Buffer.from('0000000000000011', 'hex'),
			outbox: {
				appendPath: [Buffer.alloc(1), Buffer.alloc(1)],
				root: utils.getRandomBytes(38),
				size: 18,
			},
			partnerChainOutboxRoot: utils.getRandomBytes(38),
		};

		params = {
			activeValidatorsUpdate: sortedActiveValidatorsUpdate,
			certificate: encodedDefaultCertificate,
			inboxUpdate: { ...defaultInboxUpdateValue },
			certificateThreshold: defaultNewCertificateThreshold,
			sendingChainID: defaultSendingChainIDBuffer,
		};

		partnerChainStore = interopMod.stores.get(ChainAccountStore);
		await partnerChainStore.set(
			createStoreGetter(stateStore),
			defaultSendingChainIDBuffer,
			partnerChainAccount,
		);

		partnerChannelStore = interopMod.stores.get(ChannelDataStore);
		await partnerChannelStore.set(
			createStoreGetter(stateStore),
			defaultSendingChainIDBuffer,
			partnerChannelAccount,
		);

		partnerValidatorStore = interopMod.stores.get(ChainValidatorsStore);
		await partnerValidatorStore.set(
			createStoreGetter(stateStore),
			defaultSendingChainIDBuffer,
			partnerValidatorsData,
		);

		jest
			.spyOn(interopUtils, 'checkInboxUpdateValidity')
			.mockResolvedValue({ status: VerifyStatus.OK });

		jest.spyOn(interopMod['internalMethod'], 'isLive').mockResolvedValue(true);
		jest.spyOn(interopUtils, 'computeValidatorsHash').mockReturnValue(validatorsHash);
		jest.spyOn(bls, 'verifyWeightedAggSig').mockReturnValue(true);
	});

	describe('verify', () => {
		beforeEach(() => {
			verifyContext = createTransactionContext({
				chainID,
				stateStore,
				transaction: new Transaction({
					...defaultTransaction,
					command: mainchainCCUUpdateCommand.name,
					params: codec.encode(crossChainUpdateTransactionParams, params),
				}),
			}).createCommandVerifyContext(mainchainCCUUpdateCommand.schema);
			jest.spyOn(mainchainCCUUpdateCommand['internalMethod'], 'isLive').mockResolvedValue(true);
			jest
				.spyOn(MainchainInteroperabilityInternalMethod.prototype, 'isLive')
				.mockResolvedValue(true);
		});

		it('should reject when ccu params validation fails', async () => {
			await expect(
				mainchainCCUUpdateCommand.verify({
					...verifyContext,
					params: { ...params, sendingChainID: 2 } as any,
				}),
			).rejects.toThrow('.sendingChainID');
		});

		it('should return error when sending chain not live', async () => {
			jest.spyOn(mainchainCCUUpdateCommand['internalMethod'], 'isLive').mockResolvedValue(false);
			await expect(mainchainCCUUpdateCommand.verify(verifyContext)).rejects.toThrow(
				'The sending chain is not live',
			);
		});

		it('should reject when first CCU contains a certificate older than LIVENESS_LIMIT / 2', async () => {
			await interopMod.stores.get(ChainAccountStore).set(stateStore, params.sendingChainID, {
				...partnerChainAccount,
				status: ChainStatus.REGISTERED,
			});

			await expect(
				mainchainCCUUpdateCommand.verify({
					...verifyContext,
					header: { timestamp: Math.floor(Date.now() / 1000), height: 0 },
					params: {
						...params,
						certificate: codec.encode(certificateSchema, {
							...defaultCertificateValues,
							timestamp: 0,
						}),
					},
				}),
			).rejects.toThrow(
				'The first CCU with a non-empty inbox update cannot contain a certificate older',
			);
		});

		it('should call verifyCommon', async () => {
			jest
				.spyOn(mainchainCCUUpdateCommand, 'verifyCommon' as never)
				.mockResolvedValue(undefined as never);
			await expect(
				mainchainCCUUpdateCommand.verify({
					...verifyContext,
					params: {
						...params,
					},
				}),
			).resolves.toEqual({ status: VerifyStatus.OK });

			expect(mainchainCCUUpdateCommand['verifyCommon']).toHaveBeenCalledTimes(1);
		});
	});

	describe('execute', () => {
		beforeEach(() => {
			executeContext = createTransactionContext({
				chainID,
				stateStore,
				transaction: new Transaction({
					...defaultTransaction,
					command: mainchainCCUUpdateCommand.name,
					params: codec.encode(crossChainUpdateTransactionParams, params),
				}),
			}).createCommandExecuteContext(mainchainCCUUpdateCommand.schema);
			jest
				.spyOn(mainchainCCUUpdateCommand['internalMethod'], 'appendToInboxTree')
				.mockResolvedValue();
			jest.spyOn(mainchainCCUUpdateCommand, 'apply' as never).mockResolvedValue(undefined as never);
			jest
				.spyOn(mainchainCCUUpdateCommand, '_forward' as never)
				.mockResolvedValue(undefined as never);
		});

		it('should call executeCommon', async () => {
			executeContext = createTransactionContext({
				chainID,
				stateStore,
				transaction: new Transaction({
					...defaultTransaction,
					command: mainchainCCUUpdateCommand.name,
					params: codec.encode(crossChainUpdateTransactionParams, {
						...params,
					}),
				}),
			}).createCommandExecuteContext(mainchainCCUUpdateCommand.schema);
			jest
				.spyOn(mainchainCCUUpdateCommand, 'executeCommon' as never)
				.mockResolvedValue([[], true] as never);

			await expect(mainchainCCUUpdateCommand.execute(executeContext)).resolves.toBeUndefined();
			expect(mainchainCCUUpdateCommand['executeCommon']).toHaveBeenCalledTimes(1);
			expect(mainchainCCUUpdateCommand['executeCommon']).toHaveBeenCalledWith(
				expect.anything(),
				true,
			);
		});

		it('should call apply for ccm and add to the inbox where receiving chain is the main chain', async () => {
			executeContext = createTransactionContext({
				chainID,
				stateStore,
				transaction: new Transaction({
					...defaultTransaction,
					command: mainchainCCUUpdateCommand.name,
					params: codec.encode(crossChainUpdateTransactionParams, {
						...params,
					}),
				}),
			}).createCommandExecuteContext(mainchainCCUUpdateCommand.schema);

			await expect(mainchainCCUUpdateCommand.execute(executeContext)).resolves.toBeUndefined();
			expect(mainchainCCUUpdateCommand['apply']).toHaveBeenCalledTimes(1);
			expect(mainchainCCUUpdateCommand['internalMethod'].appendToInboxTree).toHaveBeenCalledTimes(
				3,
			);
		});

		it('should call forward for ccm and add to the inbox where receiving chain is not the mainchain', async () => {
			executeContext = createTransactionContext({
				chainID,
				stateStore,
				transaction: new Transaction({
					...defaultTransaction,
					command: mainchainCCUUpdateCommand.name,
					params: codec.encode(crossChainUpdateTransactionParams, {
						...params,
					}),
				}),
			}).createCommandExecuteContext(mainchainCCUUpdateCommand.schema);

			await expect(mainchainCCUUpdateCommand.execute(executeContext)).resolves.toBeUndefined();
			expect(mainchainCCUUpdateCommand['_forward']).toHaveBeenCalledTimes(2);
			expect(mainchainCCUUpdateCommand['internalMethod'].appendToInboxTree).toHaveBeenCalledTimes(
				3,
			);
		});
	});

	describe('_forward', () => {
		const defaultCCM = {
			nonce: BigInt(0),
			module: 'token',
			crossChainCommand: 'crossChainTransfer',
			sendingChainID: Buffer.from([0, 0, 2, 0]),
			receivingChainID: Buffer.from([0, 0, 3, 0]),
			fee: BigInt(20000),
			status: 0,
			params: Buffer.alloc(0),
		};
		let context: CrossChainMessageContext;
		let command: SubmitMainchainCrossChainUpdateCommand;
		let ccMethods: Map<string, BaseCCMethod>;
		let ccCommands: Map<string, BaseCCCommand[]>;

		beforeEach(async () => {
			const interopModule = new MainchainInteroperabilityModule();
			ccMethods = new Map();
			ccMethods.set(
				'token',
				new (class TokenMethod extends BaseCCMethod {
					public verifyCrossChainMessage = jest.fn();
					public beforeCrossChainMessageForwarding = jest.fn();
				})(interopModule.stores, interopModule.events),
			);
			ccCommands = new Map();
			ccCommands.set('token', [
				new (class CrossChainTransfer extends BaseCCCommand {
					public schema = { $id: 'test/ccu', properties: {}, type: 'object' };
					public verify = jest.fn();
					public execute = jest.fn();
				})(interopModule.stores, interopModule.events),
			]);
			command = new SubmitMainchainCrossChainUpdateCommand(
				interopModule.stores,
				interopModule.events,
				ccMethods,
				ccCommands,
				interopMod['internalMethod'],
			);

			jest.spyOn(command['events'].get(CcmProcessedEvent), 'log');
			jest.spyOn(command, 'bounce' as never);
			context = createCrossChainMessageContext({
				ccm: defaultCCM,
			});
			await command['stores'].get(ChainAccountStore).set(context, context.ccm.receivingChainID, {
				lastCertificate: {
					height: 0,
					stateRoot: utils.getRandomBytes(32),
					timestamp: 0,
					validatorsHash: utils.getRandomBytes(32),
				},
				name: 'random',
				status: ChainStatus.ACTIVE,
			});
		});

		it('should terminate the chain and log event when sending chain is not live', async () => {
			(interopMod['internalMethod'].isLive as jest.Mock).mockResolvedValue(false);
			const terminateChainInternalMock = jest.fn();
			interopMod['internalMethod'].terminateChainInternal = terminateChainInternalMock;

			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(context.eventQueue.getEvents()).toHaveLength(1);
			expect(terminateChainInternalMock).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
			);
			expect(command['events'].get(CcmProcessedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
				context.ccm.receivingChainID,
				{
					ccmID: expect.any(Buffer),
					code: CCMProcessedCode.INVALID_CCM_VERIFY_CCM_EXCEPTION,
					result: CCMProcessedResult.DISCARDED,
				},
			);
		});

		it('should terminate the chain and log event when verifyCrossChainMessage fails', async () => {
			(
				(ccMethods.get('token') as BaseCCMethod).verifyCrossChainMessage as jest.Mock
			).mockRejectedValue('error');

			const terminateChainInternalMock = jest.fn();
			interopMod['internalMethod'].terminateChainInternal = terminateChainInternalMock;
			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(terminateChainInternalMock).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
			);
			expect(context.eventQueue.getEvents()).toHaveLength(1);
			expect(command['events'].get(CcmProcessedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
				context.ccm.receivingChainID,
				{
					ccmID: expect.any(Buffer),
					code: CCMProcessedCode.INVALID_CCM_VERIFY_CCM_EXCEPTION,
					result: CCMProcessedResult.DISCARDED,
				},
			);
		});

		it('should bounce and return if receiving chain does not exist', async () => {
			await command['stores'].get(ChainAccountStore).del(context, context.ccm.receivingChainID);

			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(command['bounce']).toHaveBeenCalledTimes(1);
			expect(command['bounce']).toHaveBeenCalledWith(
				expect.anything(),
				expect.any(Buffer),
				expect.any(Number),
				CCMStatusCode.CHANNEL_UNAVAILABLE,
				CCMProcessedCode.CHANNEL_UNAVAILABLE,
			);
		});

		it('should bounce and return if receiving chain status is registered', async () => {
			await command['stores'].get(ChainAccountStore).set(context, context.ccm.receivingChainID, {
				lastCertificate: {
					height: 0,
					stateRoot: utils.getRandomBytes(32),
					timestamp: 0,
					validatorsHash: utils.getRandomBytes(32),
				},
				name: 'random',
				status: ChainStatus.REGISTERED,
			});

			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(command['bounce']).toHaveBeenCalledTimes(1);
			expect(command['bounce']).toHaveBeenCalledWith(
				expect.anything(),
				expect.any(Buffer),
				expect.any(Number),
				CCMStatusCode.CHANNEL_UNAVAILABLE,
				CCMProcessedCode.CHANNEL_UNAVAILABLE,
			);
		});

		it('should terminate the chain and log event when receiving chain is not live', async () => {
			// First check sending chain, and second checks receiving chain
			(interopMod['internalMethod'].isLive as jest.Mock)
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce(false);
			const terminateChainInternalMock = jest.fn();
			interopMod['internalMethod'].terminateChainInternal = terminateChainInternalMock;
			const sendInternalMock = jest.fn();
			interopMod['internalMethod'].sendInternal = sendInternalMock;

			const chainAccount = await command['stores']
				.get(ChainAccountStore)
				.get(context, context.ccm.receivingChainID);
			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(context.eventQueue.getEvents()).toHaveLength(1);
			expect(terminateChainInternalMock).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.receivingChainID,
			);
			expect(command['events'].get(CcmProcessedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
				context.ccm.receivingChainID,
				{
					ccmID: expect.any(Buffer),
					code: CCMProcessedCode.CHANNEL_UNAVAILABLE,
					result: CCMProcessedResult.DISCARDED,
				},
			);
			expect(sendInternalMock).toHaveBeenCalledWith(
				expect.anything(),
				EMPTY_FEE_ADDRESS,
				MODULE_NAME_INTEROPERABILITY,
				CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED,
				context.ccm.sendingChainID,
				BigInt(0),
				CCMStatusCode.OK,
				codec.encode(sidechainTerminatedCCMParamsSchema, {
					chainID: context.ccm.receivingChainID,
					stateRoot: chainAccount.lastCertificate.stateRoot,
				}),
			);
		});

		it('should revert the state and terminate the sending chain if beforeCrossChainMessageForwarding fails', async () => {
			(
				(ccMethods.get('token') as BaseCCMethod).beforeCrossChainMessageForwarding as jest.Mock
			).mockRejectedValue('error');
			jest.spyOn(context.eventQueue, 'createSnapshot').mockReturnValue(99);
			jest.spyOn(context.stateStore, 'createSnapshot').mockReturnValue(10);
			jest.spyOn(context.eventQueue, 'restoreSnapshot');
			jest.spyOn(context.stateStore, 'restoreSnapshot');

			const terminateChainInternalMock = jest.fn();
			interopMod['internalMethod'].terminateChainInternal = terminateChainInternalMock;

			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(terminateChainInternalMock).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
			);
			expect(command['events'].get(CcmProcessedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
				context.ccm.receivingChainID,
				{
					ccmID: expect.any(Buffer),
					code: CCMProcessedCode.INVALID_CCM_BEFORE_CCC_FORWARDING_EXCEPTION,
					result: CCMProcessedResult.DISCARDED,
				},
			);
			expect(context.eventQueue.restoreSnapshot).toHaveBeenCalledWith(99);
			expect(context.stateStore.restoreSnapshot).toHaveBeenCalledWith(10);
		});

		it('should add ccm to receiving chain outbox and log event when valid', async () => {
			const addToOutboxMock = jest.fn();
			interopMod['internalMethod'].addToOutbox = addToOutboxMock;
			await expect(command['_forward'](context)).resolves.toBeUndefined();

			expect(addToOutboxMock).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.receivingChainID,
				context.ccm,
			);
			expect(command['events'].get(CcmProcessedEvent).log).toHaveBeenCalledWith(
				expect.anything(),
				context.ccm.sendingChainID,
				context.ccm.receivingChainID,
				{
					ccmID: expect.any(Buffer),
					code: CCMProcessedCode.SUCCESS,
					result: CCMProcessedResult.FORWARDED,
				},
			);
		});
	});
});
