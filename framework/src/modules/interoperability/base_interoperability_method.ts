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

import { BaseMethod } from '../base_method';
import { BaseCCMethod } from './base_cc_method';
import { NamedRegistry } from '../named_registry';
import { ImmutableMethodContext, MethodContext } from '../../state_machine';
import { ChainAccount, ChainAccountStore } from './stores/chain_account';
import { CCMsg } from './types';
import { BaseInteroperabilityInternalMethod } from './base_interoperability_internal_methods';
import {
	EMPTY_BYTES,
	MAX_RESERVED_ERROR_STATUS,
	EMPTY_FEE_ADDRESS,
	MODULE_NAME_INTEROPERABILITY,
	CROSS_CHAIN_COMMAND_CHANNEL_TERMINATED,
	CCMStatusCode,
} from './constants';
import { TokenMethod } from '../token';
import { OwnChainAccountStore } from './stores/own_chain_account';
import { ChannelDataStore } from './stores/channel_data';
import { TerminatedStateStore } from './stores/terminated_state';
import { TerminatedOutboxStore } from './stores/terminated_outbox';
import { getMainchainID } from './utils';

export abstract class BaseInteroperabilityMethod<
	T extends BaseInteroperabilityInternalMethod,
> extends BaseMethod {
	protected _tokenMethod!: TokenMethod & {
		payMessageFee: (
			context: MethodContext,
			payFromAddress: Buffer,
			fee: bigint,
			receivingChainID: Buffer,
		) => Promise<void>;
	};

	public constructor(
		stores: NamedRegistry,
		events: NamedRegistry,
		protected readonly interoperableCCMethods = new Map<string, BaseCCMethod>(),
		protected internalMethod: T,
	) {
		super(stores, events);
	}

	public addDependencies(
		tokenMethod: TokenMethod & {
			// TODO: Remove this after token module update
			payMessageFee: (
				context: MethodContext,
				payFromAddress: Buffer,
				fee: bigint,
				receivingChainID: Buffer,
			) => Promise<void>;
		},
	) {
		this._tokenMethod = tokenMethod;
	}

	public async getChainAccount(
		context: ImmutableMethodContext,
		chainID: Buffer,
	): Promise<ChainAccount> {
		return this.stores.get(ChainAccountStore).get(context, chainID);
	}

	public async getChannel(context: ImmutableMethodContext, chainID: Buffer) {
		return this.stores.get(ChannelDataStore).get(context, chainID);
	}

	public async getOwnChainAccount(context: ImmutableMethodContext) {
		return this.stores.get(OwnChainAccountStore).get(context, EMPTY_BYTES);
	}

	public async getTerminatedStateAccount(context: ImmutableMethodContext, chainID: Buffer) {
		return this.stores.get(TerminatedStateStore).get(context, chainID);
	}

	public async getTerminatedOutboxAccount(context: ImmutableMethodContext, chainID: Buffer) {
		return this.stores.get(TerminatedOutboxStore).get(context, chainID);
	}

	public async getMessageFeeTokenID(
		context: ImmutableMethodContext,
		chainID: Buffer,
	): Promise<Buffer> {
		const updatedChainID = !(await this.stores.get(ChainAccountStore).has(context, chainID))
			? getMainchainID(chainID)
			: chainID;
		return (await this.getChannel(context, updatedChainID)).messageFeeTokenID;
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async send(
		context: MethodContext,
		sendingAddress: Buffer,
		module: string,
		crossChainCommand: string,
		receivingChainID: Buffer,
		fee: bigint,
		status: number,
		params: Buffer,
		timestamp?: number,
	): Promise<void> {
		await this.internalMethod.sendInternal(
			context,
			sendingAddress,
			module,
			crossChainCommand,
			receivingChainID,
			fee,
			status,
			params,
			timestamp,
		);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async error(context: MethodContext, ccm: CCMsg, errorStatus: number): Promise<void> {
		// Error codes from 0 to MAX_RESERVED_ERROR_STATUS (included) are reserved to the Interoperability module.
		if (errorStatus <= 0 && errorStatus <= MAX_RESERVED_ERROR_STATUS) {
			throw new Error('Invalid error status.');
		}

		await this.send(
			context,
			EMPTY_FEE_ADDRESS,
			ccm.module,
			ccm.crossChainCommand,
			ccm.sendingChainID,
			BigInt(0),
			errorStatus,
			ccm.params,
		);
	}

	// https://github.com/LiskHQ/lips/blob/main/proposals/lip-0045.md#terminatechain
	public async terminateChain(context: MethodContext, chainID: Buffer): Promise<void> {
		if (await this.getTerminatedStateAccount(context, chainID)) {
			return;
		}

		await this.internalMethod.sendInternal(
			context,
			EMPTY_FEE_ADDRESS,
			MODULE_NAME_INTEROPERABILITY,
			CROSS_CHAIN_COMMAND_CHANNEL_TERMINATED,
			chainID,
			BigInt(0),
			CCMStatusCode.OK,
			EMPTY_BYTES,
		);

		await this.internalMethod.createTerminatedStateAccount(context, chainID);
	}
}
