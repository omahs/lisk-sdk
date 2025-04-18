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

import { utils, address as cryptoAddress } from '@liskhq/lisk-cryptography';
import { ModuleEndpointContext } from '../../../../src';
import { ValidatorsModule } from '../../../../src/modules/validators';
import { BLSKeyStore } from '../../../../src/modules/validators/stores/bls_keys';
import { ValidatorKeysStore } from '../../../../src/modules/validators/stores/validator_keys';
import { PrefixedStateReadWriter } from '../../../../src/state_machine/prefixed_state_read_writer';
import { createTransientModuleEndpointContext } from '../../../../src/testing';
import { InMemoryPrefixedStateDB } from '../../../../src/testing/in_memory_prefixed_state';
import { createStoreGetter } from '../../../../src/testing/utils';

describe('ValidatorsModuleEndpoint', () => {
	let validatorsModule: ValidatorsModule;
	let stateStore: PrefixedStateReadWriter;
	const pk = utils.getRandomBytes(48);
	const address = utils.getRandomBytes(48);
	const proof = utils.getRandomBytes(96);
	const validatorAddress = utils.getRandomBytes(20);
	const blsKey = utils.getRandomBytes(48);
	const generatorKey = utils.getRandomBytes(32);
	const validProof =
		'88bb31b27eae23038e14f9d9d1b628a39f5881b5278c3c6f0249f81ba0deb1f68aa5f8847854d6554051aa810fdf1cdb02df4af7a5647b1aa4afb60ec6d446ee17af24a8a50876ffdaf9bf475038ec5f8ebeda1c1c6a3220293e23b13a9a5d26';

	beforeAll(() => {
		validatorsModule = new ValidatorsModule();
		stateStore = new PrefixedStateReadWriter(new InMemoryPrefixedStateDB());
	});

	describe('validateBLSKey', () => {
		describe('when request data is valid', () => {
			it('should resolve with false when key already exists', async () => {
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: proof.toString('hex'),
						blsKey: pk.toString('hex'),
					},
				});

				await validatorsModule.stores
					.get(BLSKeyStore)
					.set(createStoreGetter(stateStore), pk, { address });

				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: false,
				});
			});

			it('should resolve with false when key does not exist but invalid proof of possession', async () => {
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: proof.toString('hex'),
						blsKey: pk.toString('hex'),
					},
				});
				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: false,
				});
			});

			it('should resolve with true when key does not exist and valid proof of possession', async () => {
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: validProof,
						blsKey:
							'b301803f8b5ac4a1133581fc676dfedc60d891dd5fa99028805e5ea5b08d3491af75d0707adab3b70c6a6a580217bf81',
					},
				});
				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: true,
				});
			});

			it('should resolve with false when proof of possession is invalid but bls key has a valid length', async () => {
				const validPk =
					'a491d1b0ecd9bb917989f0e74f0dea0422eac4a873e5e2644f368dffb9a6e20fd6e10c1b77654d067c0618f6e5a7f79a';
				const invalidProof =
					'b803eb0ed93ea10224a73b6b9c725796be9f5fefd215ef7a5b97234cc956cf6870db6127b7e4d824ec62276078e787db05584ce1adbf076bc0808ca0f15b73d59060254b25393d95dfc7abe3cda566842aaedf50bbb062aae1bbb6ef3b1fffff';
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: invalidProof,
						blsKey: validPk,
					},
				});
				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: false,
				});
			});

			it('should resolve with false when bls key length is less than 48 bytes and proof of possession has valid length', async () => {
				const invalidPk = utils.getRandomBytes(47).toString('hex');
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: validProof,
						blsKey: invalidPk,
					},
				});
				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: false,
				});
			});

			it('should resolve with false when bls key length is greater than 48 bytes and proof of possession has valid length', async () => {
				const invalidPk = utils.getRandomBytes(49).toString('hex');
				const context = createTransientModuleEndpointContext({
					stateStore,
					params: {
						proofOfPossession: validProof,
						blsKey: invalidPk,
					},
				});
				await expect(validatorsModule.endpoint.validateBLSKey(context)).resolves.toStrictEqual({
					valid: false,
				});
			});
		});

		describe('when request data is invalid', () => {
			it('should reject with error with invalid request params', async () => {
				await expect(
					validatorsModule.endpoint.validateBLSKey(
						createTransientModuleEndpointContext({
							stateStore,
							params: {
								invalid: 'schema',
							},
						}),
					),
				).rejects.toThrow();
			});

			it('should reject with error when input parmas bytes are invalid', async () => {
				await expect(
					validatorsModule.endpoint.validateBLSKey(
						createTransientModuleEndpointContext({
							stateStore,
							params: {
								proofOfPossession: 'xxxx',
								blsKey: 'xxxx',
							},
						}),
					),
				).rejects.toThrow();
			});
		});
	});

	describe('getValidator', () => {
		let context: ModuleEndpointContext;
		beforeEach(() => {
			context = createTransientModuleEndpointContext({
				stateStore,
				params: {
					address: cryptoAddress.getLisk32AddressFromAddress(validatorAddress),
				},
			});
		});

		it('should resolve with undefined when validator does not exist', async () => {
			await expect(validatorsModule.endpoint.getValidator(context)).resolves.toStrictEqual({
				generatorKey: '',
				blsKey: '',
			});
		});

		it('should resolve with validator keys when validator exists', async () => {
			await validatorsModule.stores
				.get(ValidatorKeysStore)
				.set(createStoreGetter(stateStore), validatorAddress, { blsKey, generatorKey });
			await expect(validatorsModule.endpoint.getValidator(context)).resolves.toStrictEqual({
				generatorKey: generatorKey.toString('hex'),
				blsKey: blsKey.toString('hex'),
			});
		});
	});
});
