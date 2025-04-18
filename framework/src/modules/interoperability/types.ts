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

import { Transaction } from '@liskhq/lisk-chain';
import { Logger } from '../../logger';
import { MethodContext, EventQueue } from '../../state_machine';
import {
	BlockHeader,
	ImmutableMethodContext,
	ImmutableStateStore,
	ImmutableSubStore,
	StateStore,
	SubStore,
	Validator,
} from '../../state_machine/types';
import { OutboxRoot } from './stores/outbox_root';
import { ChainID } from './stores/registered_names';
import { TerminatedOutboxAccount } from './stores/terminated_outbox';
import { TerminatedStateAccount } from './stores/terminated_state';

export type StoreCallback = (moduleID: Buffer, storePrefix: Buffer) => SubStore;
export type ImmutableStoreCallback = (moduleID: Buffer, storePrefix: Buffer) => ImmutableSubStore;
export interface CCMsg {
	readonly nonce: bigint;
	readonly module: string;
	readonly crossChainCommand: string;
	readonly sendingChainID: Buffer;
	readonly receivingChainID: Buffer;
	readonly fee: bigint;
	readonly status: number;
	readonly params: Buffer;
}

export interface ActiveValidator {
	blsKey: Buffer;
	bftWeight: bigint;
}

export interface ActiveValidatorJSON {
	blsKey: string;
	bftWeight: string;
}

export interface OutboxRootWitness {
	bitmap: Buffer;
	siblingHashes: Buffer[];
}

export interface InboxUpdate {
	crossChainMessages: Buffer[];
	messageWitnessHashes: Buffer[];
	outboxRootWitness: OutboxRootWitness;
}

export interface CCUpdateParams {
	sendingChainID: Buffer;
	certificate: Buffer;
	activeValidatorsUpdate: ActiveValidator[];
	certificateThreshold: bigint;
	inboxUpdate: InboxUpdate;
}
export interface ImmutableCrossChainMessageContext {
	getMethodContext: () => ImmutableMethodContext;
	getStore: ImmutableStoreCallback;
	stateStore: ImmutableStateStore;
	logger: Logger;
	chainID: Buffer;
	header: {
		timestamp: number;
		height: number;
	};
	transaction: {
		senderAddress: Buffer;
		fee: bigint;
	};
	ccm: CCMsg;
}

export interface CrossChainMessageContext extends ImmutableCrossChainMessageContext {
	getMethodContext: () => MethodContext;
	getStore: StoreCallback;
	stateStore: StateStore;
	contextStore: Map<string, unknown>;
	eventQueue: EventQueue;
}
export interface CCCommandExecuteContext<T> extends CrossChainMessageContext {
	params: T;
}
export interface RecoverContext {
	getMethodContext: () => MethodContext;
	getStore: StoreCallback;
	stateStore: StateStore;
	eventQueue: EventQueue;
	terminatedChainID: Buffer;
	module: string;
	substorePrefix: Buffer;
	storeKey: Buffer;
	storeValue: Buffer;
}

export interface SendInternalContext {
	module: string;
	crossChainCommand: string;
	receivingChainID: Buffer;
	fee: bigint;
	status: number;
	params: Buffer;
	timestamp?: number;
	getMethodContext: () => MethodContext;
	getStore: StoreCallback;
	logger: Logger;
	chainID: Buffer;
	eventQueue: EventQueue;
	feeAddress: Buffer;
	transaction: { fee: bigint; senderAddress: Buffer };
	header: { height: number; timestamp: number };
	stateStore: StateStore;
}

export interface CCMApplyContext {
	getMethodContext: () => MethodContext;
	getStore: StoreCallback;
	logger: Logger;
	chainID: Buffer;
	eventQueue: EventQueue;
	blockHeader: {
		timestamp: number;
		height: number;
	};
	transaction: {
		senderAddress: Buffer;
		fee: bigint;
	};
	ccm: CCMsg;
}

export interface CCMForwardContext {
	getMethodContext: () => MethodContext;
	getStore: StoreCallback;
	logger: Logger;
	chainID: Buffer;
	eventQueue: EventQueue;
	feeAddress: Buffer;
	ccm: CCMsg;
	ccu: CCUpdateParams;
	transaction: Transaction;
	header: BlockHeader;
}

export interface CCMBounceContext {
	eventQueue: EventQueue;
	ccm: CCMsg;
	newCCMStatus: number;
	ccmProcessedEventCode: number;
}

export interface CreateTerminatedOutboxAccountContext {
	eventQueue: EventQueue;
}

export interface CreateTerminatedStateAccountContext {
	eventQueue: EventQueue;
}

export interface LastCertificate {
	height: number;
	timestamp: number;
	stateRoot: Buffer;
	validatorsHash: Buffer;
}

export interface LastCertificateJSON {
	height: number;
	timestamp: number;
	stateRoot: string;
	validatorsHash: string;
}

export interface ChainAccount {
	name: string;
	lastCertificate: LastCertificate;
	status: number;
}

export interface ChainAccountJSON {
	name: string;
	lastCertificate: LastCertificateJSON;
	status: number;
}

export interface OwnChainAccount {
	name: string;
	chainID: Buffer;
	nonce: bigint;
}

export interface OwnChainAccountJSON {
	name: string;
	chainID: string;
	nonce: string;
}

type InboxOutbox = {
	appendPath: Buffer[];
	size: number;
	root: Buffer;
};
export type Inbox = InboxOutbox;
export type Outbox = InboxOutbox;

type InboxOutboxJSON = {
	appendPath: string[];
	size: number;
	root: string;
};
export type InboxJSON = InboxOutboxJSON;
export type OutboxJSON = InboxOutboxJSON;

export interface ChannelData {
	inbox: Inbox;
	outbox: Outbox;
	partnerChainOutboxRoot: Buffer;
	messageFeeTokenID: Buffer;
}

export interface ChannelDataJSON {
	inbox: InboxJSON;
	outbox: OutboxJSON;
	partnerChainOutboxRoot: string;
	messageFeeTokenID: string;
}

export interface ActiveValidators {
	blsKey: Buffer;
	bftWeight: bigint;
}

export interface RegistrationParametersValidator {
	blsKey: Buffer;
	bftWeight: bigint;
}

export interface SidechainRegistrationParams {
	name: string;
	chainID: Buffer;
	initValidators: RegistrationParametersValidator[];
	certificateThreshold: bigint;
}

export interface MainchainRegistrationParams {
	ownChainID: Buffer;
	ownName: string;
	mainchainValidators: RegistrationParametersValidator[];
	signature: Buffer;
	aggregationBits: Buffer;
}

export interface ValidatorKeys {
	generatorKey: Buffer;
	blsKey: Buffer;
}

export interface ValidatorsMethod {
	getValidatorKeys(methodContext: ImmutableMethodContext, address: Buffer): Promise<ValidatorKeys>;
	getValidatorsParams(
		methodContext: ImmutableMethodContext,
	): Promise<{ validators: Validator[]; certificateThreshold: bigint }>;
}

export interface CrossChainCommandDependencies {
	validatorsMethod: ValidatorsMethod;
}

export interface ValidatorsHashInput {
	activeValidators: ActiveValidator[];
	certificateThreshold: bigint;
}

export interface MessageRecoveryParams {
	chainID: Buffer;
	crossChainMessages: Buffer[];
	idxs: number[];
	siblingHashes: Buffer[];
}

export interface MessageRecoveryVerificationParams {
	crossChainMessages: Buffer[];
	idxs: number[];
	siblingHashes: Buffer[];
}

export interface StoreEntry {
	substorePrefix: Buffer;
	storeKey: Buffer;
	storeValue: Buffer;
	bitmap: Buffer;
}

export interface StateRecoveryParams {
	chainID: Buffer;
	module: string;
	storeEntries: StoreEntry[];
	siblingHashes: Buffer[];
}

export interface StateRecoveryInitParams {
	chainID: Buffer;
	sidechainAccount: Buffer;
	bitmap: Buffer;
	siblingHashes: Buffer[];
}

export interface TerminateSidehchainForLivenessParams {
	chainID: Buffer;
}

export interface CrossChainUpdateTransactionParams {
	sendingChainID: Buffer;
	certificate: Buffer;
	activeValidatorsUpdate: ActiveValidator[];
	certificateThreshold: bigint;
	inboxUpdate: InboxUpdate;
}

export interface ChainValidators {
	activeValidators: ActiveValidator[];
	certificateThreshold: bigint;
}

export interface ChainValidatorsJSON {
	activeValidators: ActiveValidatorJSON[];
	certificateThreshold: string;
}

export interface GenesisInteroperability {
	outboxRootSubstore: {
		storeKey: Buffer;
		storeValue: OutboxRoot;
	}[];
	chainDataSubstore: {
		storeKey: Buffer;
		storeValue: ChainAccount;
	}[];
	channelDataSubstore: {
		storeKey: Buffer;
		storeValue: ChannelData;
	}[];
	chainValidatorsSubstore: {
		storeKey: Buffer;
		storeValue: ValidatorsHashInput;
	}[];
	ownChainDataSubstore: {
		storeKey: Buffer;
		storeValue: OwnChainAccount;
	}[];
	terminatedStateSubstore: {
		storeKey: Buffer;
		storeValue: TerminatedStateAccount;
	}[];
	terminatedOutboxSubstore: {
		storeKey: Buffer;
		storeValue: TerminatedOutboxAccount;
	}[];
	registeredNamesSubstore: {
		storeKey: Buffer;
		storeValue: ChainID;
	}[];
}

export interface CCMRegistrationParams {
	name: string;
	messageFeeTokenID: Buffer;
}
export interface TokenMethod {
	initializeUserAccount(
		methodContext: MethodContext,
		address: Buffer,
		tokenID: Buffer,
	): Promise<void>;
}

export interface FeeMethod {
	payFee(methodContext: MethodContext, amount: bigint): void;
}
