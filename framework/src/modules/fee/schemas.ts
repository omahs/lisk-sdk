/*
 * Copyright © 2021 Lisk Foundation
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

export const configSchema = {
	$id: '/fee/config',
	type: 'object',
	properties: {
		feeTokenID: {
			type: 'string',
			format: 'hex',
		},
	},
	required: ['feeTokenID'],
};

export const getMinFeePerByteResponseSchema = {
	$id: '/fee/endpoint/getMinFeePerByteResponse',
	type: 'object',
	properties: {
		minFeePerByte: {
			type: 'integer',
			format: 'uint32',
		},
	},
	required: ['minFeePerByte'],
};

export const getFeeTokenIDResponseSchema = {
	$id: '/fee/endpoint/getFeeTokenIDResponseSchema',
	type: 'object',
	properties: {
		feeTokenID: {
			type: 'string',
			format: 'hex',
		},
	},
	required: ['feeTokenID'],
};
