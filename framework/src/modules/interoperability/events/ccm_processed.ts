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

import { BaseEvent, EventQueuer } from '../../base_event';

export const enum CCMProcessedResult {
	// Value of result of CCM Processed Event if CCM is applied
	APPLIED = 0,
	// Value of result of CCM Processed Event if CCM is forwarded
	FORWARDED = 1,
	// Value of result of CCM Processed Event if CCM is bounced
	BOUNCED = 2,
	// Value of result of CCM Processed Event if CCM is discarded
	DISCARDED = 3,
}

export const enum CCMProcessedCode {
	// Value of code of CCM Processed Event if processing succeeded
	SUCCESS = 0,
	// Value of code of CCM Processed Event if processing failed due to: channel unavailable
	CHANNEL_UNAVAILABLE = 1,
	// Value of code of CCM Processed Event if processing failed due to: module not supported
	MODULE_NOT_SUPPORTED = 2,
	// Value of code of CCM Processed Event if processing failed due to: cross-chain command not supported
	CROSS_CHAIN_COMMAND_NOT_SUPPORTED = 3,
	// Value of code of CCM Processed Event if processing failed due to: exception in cross-chain command execution
	FAILED_CCM = 4,
	// Value of code of CCM Processed Event if processing failed due to: exception in validation
	INVALID_CCM_VALIDATION_EXCEPTION = 5,
	// Value of code of CCM Processed Event if processing failed due to: exception in CCM verification
	INVALID_CCM_VERIFY_CCM_EXCEPTION = 6,
	// Value of code of CCM Processed Event if processing failed due to: exception in cross-chain command verification
	INVALID_CCM_VERIFY_EXCEPTION = 7,
	// Value of code of CCM Processed Event if processing failed due to: exception in before cross-chain command execution
	INVALID_CCM_BEFORE_CCC_EXECUTION_EXCEPTION = 8,
	// Value of code of CCM Processed Event if processing failed due to: exception in after cross-chain command execution
	INVALID_CCM_AFTER_CCC_EXECUTION_EXCEPTION = 9,
	// Value of code of CCM Processed Event if processing failed due to: exception in before cross-chain command forwarding
	INVALID_CCM_BEFORE_CCC_FORWARDING_EXCEPTION = 10,
}

export interface CcmProcessedEventData {
	ccmID: Buffer;
	result: CCMProcessedResult;
	code: CCMProcessedCode;
}

export const ccmProcessedEventSchema = {
	$id: '/interoperability/events/ccmProcessed',
	type: 'object',
	required: ['ccmID', 'result', 'code'],
	properties: {
		ccmID: {
			dataType: 'bytes',
			fieldNumber: 1,
		},
		result: {
			dataType: 'uint32',
			fieldNumber: 2,
		},
		code: {
			dataType: 'uint32',
			fieldNumber: 3,
		},
	},
};

export class CcmProcessedEvent extends BaseEvent<CcmProcessedEventData> {
	public schema = ccmProcessedEventSchema;

	public log(
		ctx: EventQueuer,
		sendingChainID: Buffer,
		receivingChainID: Buffer,
		data: CcmProcessedEventData,
	): void {
		this.add(ctx, data, [sendingChainID, receivingChainID, data.ccmID]);
	}
}
