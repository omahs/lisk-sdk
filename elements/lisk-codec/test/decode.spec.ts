/*
 * Copyright © 2020 Lisk Foundation
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

import { codec } from '../src/codec';
import { buildTestCases, getAccountFromJSON } from './utils';
import { writeSInt64, writeUInt32, writeUInt64 } from '../src/varint';

import { testCases as accountTestCases } from '../fixtures/account_decodings.json';
import { testCases as arrayTestCases } from '../fixtures/arrays_decodings.json';
import { testCases as blockAssetTestCases } from '../fixtures/block_asset_decodings.json';
import { testCases as blockTestCases } from '../fixtures/block_decodings.json';
import { testCases as blockHeaderTestCases } from '../fixtures/block_header_decodings.json';
import { testCases as booleanTestCases } from '../fixtures/boolean_decodings.json';
import { testCases as bytesTestCases } from '../fixtures/bytes_decodings.json';
import { testCases as cartSampleTestCases } from '../fixtures/cart_sample_decodings.json';
import { testCases as genesisBlockTestCases } from '../fixtures/genesis_block_decodings.json';
import { testCases as nestedArrayTestCases } from '../fixtures/nested_array_decodings.json';
import { testCases as numberTestCases } from '../fixtures/number_decodings.json';
import { testCases as objectsTestCases } from '../fixtures/objects_decodings.json';
import { testCases as peerInfoTestCases } from '../fixtures/peer_info_sample_decodings.json';
import { testCases as stringTestCases } from '../fixtures/string_decodings.json';
import { testCases as transactionTestCases } from '../fixtures/transaction_decodings.json';
import { generateKey } from '../src/utils';

describe('decode', () => {
	describe('account', () => {
		it.each(buildTestCases(accountTestCases))('%s', ({ input, output }) => {
			const object = getAccountFromJSON(output.object);

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('array', () => {
		const isObjectArray = (x: any): x is { address: string; amount: string }[] =>
			typeof x[0] === 'object' && x[0].address;

		it.each(buildTestCases(arrayTestCases))('%s', ({ input, output }) => {
			let object: any = { ...output.object };

			if (isObjectArray(object.list)) {
				object = {
					list: object.list.map(
						(o: { address: string; amount: string | number | bigint | boolean }) => ({
							...o,
							amount: BigInt(o.amount),
						}),
					),
				};
			}

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('block_asset', () => {
		it.each(buildTestCases(blockAssetTestCases))('%s', ({ input, output }) => {
			const object = {
				...output.object,
				seedReveal: Buffer.from(output.object.seedReveal, 'hex'),
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('block', () => {
		it.each(buildTestCases(blockTestCases))('%s', ({ input, output }) => {
			const object = {
				header: Buffer.from(output.object.header, 'hex'),
				payload: output.object.payload.map(p => Buffer.from(p, 'hex')),
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('block_header', () => {
		it.each(buildTestCases(blockHeaderTestCases))('%s', ({ input, output }) => {
			const object = {
				...output.object,
				previousBlockID: Buffer.from(output.object.previousBlockID, 'hex'),
				transactionRoot: Buffer.from(output.object.transactionRoot, 'hex'),
				generatorPublicKey: Buffer.from(output.object.generatorPublicKey, 'hex'),
				reward: BigInt(output.object.reward),
				asset: Buffer.from(output.object.asset, 'hex'),
				signature: Buffer.from(output.object.signature, 'hex'),
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('boolean', () => {
		it.each(buildTestCases(booleanTestCases))('%s', ({ input, output }) => {
			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(output.object);
		});

		it('should fail when decoding a boolean value where the value is a byte unequal to 0x00 and 0x01', () => {
			const schema = {
				$id: 'boolean/invalidBytes',
				type: 'object',
				properties: {
					data: {
						dataType: 'boolean',
						fieldNumber: 1,
					},
				},
			};
			const key = generateKey(schema.properties.data);

			const keypair1 = Buffer.concat([key, Buffer.from([4])]);

			expect(() => codec.decode(schema, keypair1)).toThrow('Invalid boolean bytes.');
		});
	});

	describe('bytes', () => {
		it.each(buildTestCases(bytesTestCases))('%s', ({ input, output }) => {
			const object = {
				...output.object,
				address: Buffer.from(output.object.address, 'hex'),
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});

		it('should fail when decoding a binary message that does not respect the fieldNumber order', () => {
			const schema = {
				$id: 'duplicate/wrongOrder',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
					later: {
						dataType: 'uint32',
						fieldNumber: 3,
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);
			const key2 = generateKey(schema.properties.later);
			const intVal2 = writeUInt32(9999);

			const keypair1 = Buffer.concat([key, intVal1]);
			const keypair2 = Buffer.concat([key2, intVal2]);
			const encodedValue = Buffer.concat([keypair2, keypair1]);

			expect(() => codec.decode(schema, encodedValue)).toThrow(
				'Invalid field number while decoding',
			);
		});

		it('should fail when decoding where one fieldNumber is used twice', () => {
			const schema = {
				$id: 'duplicate/fieldNumber',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);
			const intVal2 = writeUInt32(9999);

			const keypair1 = Buffer.concat([key, intVal1]);
			const keypair2 = Buffer.concat([key, intVal2]);
			const encodedValue = Buffer.concat([keypair1, keypair2]);

			expect(() => codec.decode(schema, encodedValue)).toThrow('Invalid terminate index.');
		});

		it('should decode a binary message where the fieldNumbers in the schema are not sequential', () => {
			const schema = {
				$id: 'duplicate/nonSequential',
				type: 'object',
				properties: {
					later: {
						dataType: 'uint32',
						fieldNumber: 3,
					},
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
				},
			};
			const value = { later: 99, data: 255 };
			const encoded = codec.encode(schema, value);

			expect(codec.decode(schema, encoded)).toEqual(value);
		});

		it('should not decode a binary message where one required property (not of type array) is not contained in the binary message ', () => {
			const schema = {
				$id: 'duplicate/skipped',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
					later: {
						dataType: 'uint32',
						fieldNumber: 3,
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);

			const keypair1 = Buffer.concat([key, intVal1]);
			const encodedValue = Buffer.concat([keypair1]);

			expect(() => codec.decode(schema, encodedValue)).toThrow(
				'Message does not contain a property for fieldNumber: 3.',
			);
		});

		it('should not decode a binary message that contains a field number not present in the schema', () => {
			const schema = {
				$id: 'duplicate/fieldNumberNotExist',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);

			const key2 = generateKey({
				fieldNumber: 99,
				dataType: 'uint64',
			});
			const intVal2 = writeUInt64(BigInt(9999));

			const keypair1 = Buffer.concat([key, intVal1]);
			const keypair2 = Buffer.concat([key2, intVal2]);
			const encodedValue = Buffer.concat([keypair2, keypair1]);

			expect(() => codec.decode(schema, encodedValue)).toThrow(
				'Invalid field number while decoding',
			);
		});

		it('should not decode a binary message that contains some bytes at the end that cannot be decoded to some key-value pairs. E.g., a binary message concatenated with the byte 0x00', () => {
			const schema = {
				$id: 'duplicate/extraBytes',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);

			const keypair1 = Buffer.concat([key, intVal1]);
			const encodedValue = Buffer.concat([keypair1, Buffer.alloc(20, 255)]);

			expect(() => codec.decode(schema, encodedValue)).toThrow('Invalid terminate index.');
		});

		it('should not decode a binary message which contains a key-value pair for a property of type array for which packed encoding is used (for example boolean), and the value exist as empty bytes', () => {
			const schema = {
				$id: 'duplicate/arrayEmptyBytes',
				type: 'object',
				properties: {
					data: {
						dataType: 'uint32',
						fieldNumber: 1,
					},
					arr: {
						type: 'array',
						fieldNumber: 2,
						items: {
							dataType: 'boolean',
						},
					},
				},
			};
			const key = generateKey(schema.properties.data);
			const intVal1 = writeUInt32(20);

			const key2 = generateKey(schema.properties.arr);

			const keypair1 = Buffer.concat([key, intVal1]);
			const keypair2 = Buffer.concat([key2]);
			const encodedValue = Buffer.concat([keypair1, keypair2]);

			expect(() => codec.decode(schema, encodedValue)).toThrow('Invalid buffer length');
		});
	});

	describe('cart_sample', () => {
		it.each(buildTestCases(cartSampleTestCases))('%s', ({ input, output }) => {
			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(output.object);
		});
	});

	describe('genesis_block', () => {
		it.each(buildTestCases(genesisBlockTestCases))('%s', ({ input, output }) => {
			const object = {
				...output.object,
				initValidators: output.object.initValidators.map(d => Buffer.from(d, 'hex')),
				accounts: output.object.accounts.map(a => getAccountFromJSON(a)),
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});

	describe('nested_array', () => {
		it.each(buildTestCases(nestedArrayTestCases))('%s', ({ input, output }) => {
			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(output.object);
		});
	});

	describe('number', () => {
		it.each(buildTestCases(numberTestCases))('%s', ({ input, output }) => {
			const object = {
				...output.object,
				number:
					typeof output.object.number === 'string'
						? BigInt(output.object.number)
						: output.object.number,
			};

			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(object);
		});

		it('should fail when decoding out of range sint', () => {
			const schema = {
				$id: 'number-schema-sint32',
				type: 'object',
				properties: {
					number: {
						dataType: 'sint32',
						fieldNumber: 1,
					},
				},
			};
			const MAX_SINT64 = BigInt('9223372036854775807'); // BigInt(2 ** (64 - 1) - 1) -1

			expect(() => codec.decode(schema, writeSInt64(MAX_SINT64))).toThrow(
				'Value out of range of uint32',
			);
		});
	});

	describe('objects', () => {
		it(objectsTestCases[0].description, () => {
			const testCase = objectsTestCases[0];
			const output = testCase.output as any;

			const object = {
				...output.object,
				address: Buffer.from(output.object.address, 'hex'),
				balance: BigInt(output.object.balance),
			};

			const result = codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex'));

			expect(result).toEqual(object);
		});

		it(objectsTestCases[1].description, () => {
			const testCase = objectsTestCases[1];

			expect(() =>
				codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex')),
			).toThrow('Invalid field number');
		});
	});

	describe('peer info', () => {
		it.each(buildTestCases(peerInfoTestCases))('%s', ({ input, output }) => {
			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(output.object);
		});
	});

	describe('string', () => {
		it.each(buildTestCases(stringTestCases))('%s', ({ input, output }) => {
			const result = codec.decode(input.schema, Buffer.from(input.value, 'hex'));

			expect(result).toEqual(output.object);
		});

		it('should decode a string that contains some non-ASCII characters', () => {
			const schema = {
				$id: 'string-schema',
				type: 'object',
				properties: {
					data: {
						dataType: 'string',
						fieldNumber: 1,
					},
				},
			};

			const result = codec.decode(
				schema,
				Buffer.from('0a18436865636b6f7574204c69736b2053444b21c2a2c2a3c2a1', 'hex'),
			);

			expect(result).toEqual({ data: 'Checkout Lisk SDK!¢£¡' });
		});
	});

	describe('transaction', () => {
		// Base transaction
		it(transactionTestCases[0].description, () => {
			const testCase = transactionTestCases[0];
			const output = testCase.output as any;

			const object = {
				...output.object,
				nonce: BigInt(output.object.nonce),
				fee: BigInt(output.object.fee),
				senderPublicKey: Buffer.from(output.object.senderPublicKey, 'hex'),
				asset: Buffer.from(output.object.asset, 'hex'),
				signatures: output.object.signatures.map((s: string) => Buffer.from(s, 'hex')),
			};

			const result = codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex'));

			expect(result).toEqual(object);
		});

		// stake asset
		it(transactionTestCases[1].description, () => {
			const testCase = transactionTestCases[1];
			const output = testCase.output as any;

			const object = {
				...output.object,
				stakes: output.object.stakes.map((v: any) => ({
					validatorAddress: Buffer.from(v.validatorAddress, 'hex'),
					amount: BigInt(v.amount),
				})),
			};

			const result = codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex'));

			expect(result).toEqual(object);
		});

		// multisignature asset
		it(transactionTestCases[2].description, () => {
			const testCase = transactionTestCases[2];
			const output = testCase.output as any;

			const object = {
				...output.object,
				mandatoryKeys: output.object.mandatoryKeys.map((v: string) => Buffer.from(v, 'hex')),
				optionalKeys: output.object.optionalKeys.map((v: string) => Buffer.from(v, 'hex')),
			};

			const result = codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex'));

			expect(result).toEqual(object);
		});

		// multisignature asset
		it(transactionTestCases[3].description, () => {
			const testCase = transactionTestCases[3];
			const output = testCase.output as any;

			const object = {
				...output.object,
				mandatoryKeys: output.object.mandatoryKeys.map((v: string) => Buffer.from(v, 'hex')),
				optionalKeys: output.object.optionalKeys.map((v: string) => Buffer.from(v, 'hex')),
			};

			const result = codec.decode(testCase.input.schema, Buffer.from(testCase.input.value, 'hex'));

			expect(result).toEqual(object);
		});
	});
});
