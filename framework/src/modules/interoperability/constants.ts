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

import { utils } from '@liskhq/lisk-cryptography';

export const MODULE_NAME_INTEROPERABILITY = 'interoperability';

// General constants
export const MAINCHAIN_NAME = 'lisk-mainchain';
export const MAX_RESERVED_ERROR_STATUS = 63;
export const BLS_PUBLIC_KEY_LENGTH = 48;
export const BLS_SIGNATURE_LENGTH = 96;
export const SMT_KEY_LENGTH = 38;
export const NUMBER_MAINCHAIN_VALIDATORS = 101;
export const TAG_CHAIN_REG_MESSAGE = 'LSK_CHAIN_REGISTRATION';
export const LIVENESS_LIMIT = 2592000; // 30*24*3600
export const MAX_CCM_SIZE = 10240;
export const EMPTY_FEE_ADDRESS = Buffer.alloc(0);
export const EMPTY_BYTES = Buffer.alloc(0);
export const EMPTY_HASH = utils.hash(EMPTY_BYTES);
export const REGISTRATION_FEE = BigInt(1000000000);
export const MAX_NUM_VALIDATORS = 199;
export const MAX_LENGTH_NAME = 40;
export const MAX_UINT32 = 4294967295;
export const MAX_UINT64 = BigInt('18446744073709551615'); // BigInt((2 ** 64) - 1) - 1
export const THRESHOLD_MAINCHAIN = 68;
export const MESSAGE_TAG_CERTIFICATE = 'LSK_CE_';
export const MIN_CHAIN_NAME_LENGTH = 1;
export const MAX_CHAIN_NAME_LENGTH = 32;
export const HASH_LENGTH = 32;
export const MIN_MODULE_NAME_LENGTH = 1;
export const MAX_MODULE_NAME_LENGTH = 32;
export const MIN_CROSS_CHAIN_COMMAND_NAME_LENGTH = 1;
export const MAX_CROSS_CHAIN_COMMAND_NAME_LENGTH = 32;
export const CHAIN_ID_LENGTH = 4;

// Cross chain command names
export const CROSS_CHAIN_COMMAND_NAME_REGISTRATION = 'registration';
export const CROSS_CHAIN_COMMAND_NAME_CHANNEL_TERMINATED = 'channelTerminated';
export const CROSS_CHAIN_COMMAND_NAME_SIDECHAIN_TERMINATED = 'sidechainTerminated';

// Cross chain commands
export const CROSS_CHAIN_COMMAND_CHANNEL_TERMINATED = 'channelTerminated';

export const enum CCMStatusCode {
	// Value of status of a new CCM which is not a response due do an error
	OK = 0,
	// Value of status of returned CCM due to error: channel unavailable
	CHANNEL_UNAVAILABLE = 1,
	// Value of status of returned CCM due to error: module not supported
	MODULE_NOT_SUPPORTED = 2,
	// Value of status of returned CCM due to error: cross-chain command not supported
	CROSS_CHAIN_COMMAND_NOT_SUPPORTED = 3,
	// Value of status of returned CCM due to error: failed ccm execution
	FAILED_CCM = 4,
	// Value of status of CCM that have been recovered with a message recovery command
	RECOVERED = 5,
}

export const MIN_RETURN_FEE = BigInt(1000);
export const CROSS_CHAIN_COMMAND_REGISTRATION = 'crossChainCommandRegistration';
export const CCM_SENT_STATUS_SUCCESS = 0;

// Commands
export const COMMAND_NAME_SIDECHAIN_REG = 'registerSidechain';
export const COMMAND_NAME_MAINCHAIN_REG = 'registerMainchain';
export const COMMAND_NAME_STATE_RECOVERY = 'recoverState';
export const COMMAND_NAME_MESSAGE_RECOVERY = 'recoverMessage';
export const COMMAND_NAME_STATE_RECOVERY_INIT = 'initializeStateRecovery';
export const COMMAND_NAME_LIVENESS_TERMINATION = 'terminateSidechainForLiveness';

// Events
export const EVENT_NAME_CHAIN_ACCOUNT_UPDATED = 'chainAccountUpdated';
export const EVENT_NAME_CCM_PROCESSED = 'ccmProcessed';
export const EVENT_NAME_CCM_SEND_SUCCESS = 'ccmSendSucess';

export const CONTEXT_STORE_KEY_CCM_PROCESSING = 'CONTEXT_STORE_KEY_CCM_PROCESSING';
