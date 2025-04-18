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

import { when } from 'jest-when';
import { BlockHeader, blockHeaderSchema, Transaction } from '@liskhq/lisk-chain';
import { objects } from '@liskhq/lisk-utils';
import { address, utils, legacy } from '@liskhq/lisk-cryptography';
import { codec } from '@liskhq/lisk-codec';
import { Status } from '@liskhq/lisk-transaction-pool/dist-node/types';
import { ReportMisbehaviorCommand, VerifyStatus, PoSModule } from '../../../../../src';
import * as testing from '../../../../../src/testing';
import {
	defaultConfig,
	LOCKING_PERIOD_SELF_STAKES,
	REPORTING_PUNISHMENT_REWARD,
} from '../../../../../src/modules/pos/constants';
import {
	TokenMethod,
	ValidatorsMethod,
	PomTransactionParams,
} from '../../../../../src/modules/pos/types';
import { DEFAULT_LOCAL_ID } from '../../../../utils/mocks/transaction';
import * as bftUtil from '../../../../../src/engine/bft/utils';
import { PrefixedStateReadWriter } from '../../../../../src/state_machine/prefixed_state_read_writer';
import { InMemoryPrefixedStateDB } from '../../../../../src/testing/in_memory_prefixed_state';
import { ValidatorAccount, ValidatorStore } from '../../../../../src/modules/pos/stores/validator';
import { createStoreGetter } from '../../../../../src/testing/utils';
import { EligibleValidatorsStore } from '../../../../../src/modules/pos/stores/eligible_validators';

describe('ReportMisbehaviorCommand', () => {
	const pos = new PoSModule();
	let pomCommand: ReportMisbehaviorCommand;
	let stateStore: PrefixedStateReadWriter;
	let validatorSubstore: ValidatorStore;
	let mockTokenMethod: TokenMethod;
	let mockValidatorsMethod: ValidatorsMethod;
	const blockHeight = 8760000;
	const reportPunishmentReward = REPORTING_PUNISHMENT_REWARD;
	let context: any;
	let misBehavingValidator: ValidatorAccount;
	let normalValidator: ValidatorAccount;
	let header1: BlockHeader;
	let header2: BlockHeader;
	let transaction: any;
	let transactionParams: Buffer;
	let transactionParamsDecoded: PomTransactionParams;
	const publicKey = utils.getRandomBytes(32);
	const senderAddress = address.getAddressFromPublicKey(publicKey);
	const header = testing.createFakeBlockHeader({
		height: blockHeight,
	});
	const { publicKey: validator1PublicKey } = legacy.getPrivateAndPublicKeyFromPassphrase(
		utils.getRandomBytes(20).toString('utf8'),
	);
	const validator1Address = address.getAddressFromPublicKey(validator1PublicKey);
	const defaultValidatorInfo = {
		totalStakeReceived: BigInt(100000000),
		selfStake: BigInt(0),
		lastGeneratedHeight: 0,
		isBanned: false,
		pomHeights: [],
		consecutiveMissedBlocks: 0,
		commission: 0,
		lastCommissionIncreaseHeight: 0,
		sharingCoefficients: [{ tokenID: Buffer.alloc(8), coefficient: Buffer.alloc(24) }],
	};

	beforeEach(async () => {
		pos.stores.get(EligibleValidatorsStore).init({
			...defaultConfig,
			minWeightStandby: BigInt(defaultConfig.minWeightStandby),
			posTokenID: Buffer.alloc(8),
			validatorRegistrationFee: BigInt(defaultConfig.validatorRegistrationFee),
		});
		pomCommand = new ReportMisbehaviorCommand(pos.stores, pos.events);
		mockTokenMethod = {
			lock: jest.fn(),
			unlock: jest.fn(),
			getAvailableBalance: jest.fn(),
			burn: jest.fn(),
			transfer: jest.fn(),
			getLockedAmount: jest.fn(),
		};
		mockValidatorsMethod = {
			setValidatorGeneratorKey: jest.fn(),
			registerValidatorKeys: jest.fn(),
			getValidatorKeys: jest.fn().mockResolvedValue({ generatorKey: publicKey }),
			getGeneratorsBetweenTimestamps: jest.fn(),
			setValidatorsParams: jest.fn(),
		};
		pomCommand.addDependencies({
			tokenMethod: mockTokenMethod,
			validatorsMethod: mockValidatorsMethod,
		});
		stateStore = new PrefixedStateReadWriter(new InMemoryPrefixedStateDB());
		validatorSubstore = pos.stores.get(ValidatorStore);

		misBehavingValidator = { name: 'misBehavingValidator', ...defaultValidatorInfo };
		normalValidator = { name: 'normalValidator', ...defaultValidatorInfo };

		const { id: id1, ...fakeBlockHeader1 } = testing
			.createFakeBlockHeader({
				generatorAddress: validator1Address,
			})
			.toObject();
		const { id: id2, ...fakeBlockHeader2 } = testing
			.createFakeBlockHeader({
				generatorAddress: validator1Address,
			})
			.toObject();

		header1 = fakeBlockHeader1 as BlockHeader;
		header2 = fakeBlockHeader2 as BlockHeader;

		pomCommand.init({
			posTokenID: DEFAULT_LOCAL_ID,
			factorSelfStakes: 10,
		});
		stateStore = new PrefixedStateReadWriter(new InMemoryPrefixedStateDB());
		transaction = new Transaction({
			module: 'pos',
			command: 'reportValidatorMisbehavior',
			senderPublicKey: publicKey,
			nonce: BigInt(0),
			fee: BigInt(100000000),
			params: Buffer.alloc(0),
			signatures: [publicKey],
		});

		await validatorSubstore.set(createStoreGetter(stateStore), senderAddress, {
			name: 'mrrobot',
			totalStakeReceived: BigInt(10000000000),
			selfStake: BigInt(1000000000),
			lastGeneratedHeight: 100,
			isBanned: false,
			pomHeights: [],
			consecutiveMissedBlocks: 0,
			commission: 0,
			lastCommissionIncreaseHeight: 0,
			sharingCoefficients: [{ tokenID: Buffer.alloc(8), coefficient: Buffer.alloc(24) }],
		});
		await validatorSubstore.set(createStoreGetter(stateStore), validator1Address, normalValidator);
		await validatorSubstore.set(
			createStoreGetter(stateStore),
			validator1Address,
			misBehavingValidator,
		);
	});

	describe('constructor', () => {
		it('should have valid name', () => {
			expect(pomCommand.name).toBe('reportMisbehavior');
		});

		it('should have valid schema', () => {
			expect(pomCommand.schema).toMatchSnapshot();
		});
	});

	describe('verify', () => {
		it('should successfully verify the transaction', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, { ...header1 }),
				header2: codec.encode(blockHeaderSchema, { ...header2 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).resolves.toHaveProperty('status', Status.OK);
		});

		it('should throw error when generatorPublicKey does not match', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
				}),
				header2: codec.encode(blockHeaderSchema, {
					...header2,
					generatorAddress: utils.getRandomBytes(20),
				}),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.verify(context)).rejects.toThrow(
				'Different generator address never contradict to each other.',
			);
		});

		it('should throw error when header1 cannot be decoded', async () => {
			transactionParamsDecoded = {
				header1: utils.getRandomBytes(32),
				header2: codec.encode(blockHeaderSchema, { ...header2 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.verify(context)).rejects.toThrow();
		});

		it('should throw error when header2 cannot be decoded', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, { ...header1 }),
				header2: utils.getRandomBytes(32),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.verify(context)).rejects.toThrow();
		});

		it('should throw an error when header1 has an invalid signature', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					signature: utils.getRandomBytes(64),
				}),
				header2: codec.encode(blockHeaderSchema, { ...header2 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.verify(context)).rejects.toThrow('Invalid block signature.');
		});

		it('should throw an error when header2 has an invalid signature', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, { ...header1 }),
				header2: codec.encode(blockHeaderSchema, {
					...header2,
					signature: utils.getRandomBytes(64),
				}),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.verify(context)).rejects.toThrow('Invalid block signature.');
		});

		it('should throw an error when maxPunishableHeight is greater than or equal to LOCKING_PERIOD_SELF_STAKES', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					height: LOCKING_PERIOD_SELF_STAKES,
				}),
				header2: codec.encode(blockHeaderSchema, { ...header2 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).rejects.toThrow('Locking period has expired.');
		});

		it('should throw error if misbehaving account is already punished at height h', async () => {
			const block1Height = blockHeight - 768;
			const block2Height = block1Height + 15;

			const transactionParamsPreDecoded = {
				header1: { ...header1, height: block1Height },
				header2: { ...header2, height: block2Height },
			};

			const updatedValidatorAccount = objects.cloneDeep(misBehavingValidator);
			updatedValidatorAccount.pomHeights = [transactionParamsPreDecoded.header1.height + 10];
			await validatorSubstore.set(
				createStoreGetter(stateStore),
				validator1Address,
				updatedValidatorAccount,
			);
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).rejects.toThrow('Validator is already punished.');
		});

		it('should throw error if misbehaving account is already banned', async () => {
			const block1Height = blockHeight - 768;
			const block2Height = block1Height + 15;

			const transactionParamsPreDecoded = {
				header1: { ...header1, height: block1Height },
				header2: { ...header2, height: block2Height },
			};

			const updatedValidatorAccount = objects.cloneDeep(misBehavingValidator);
			updatedValidatorAccount.isBanned = true;
			await validatorSubstore.set(
				createStoreGetter(stateStore),
				validator1Address,
				updatedValidatorAccount,
			);
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).rejects.toThrow('Validator is already banned.');
		});

		it('should throw error if both headers are the same', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
				}),
				header2: codec.encode(blockHeaderSchema, {
					...header1,
				}),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).resolves.toHaveProperty(
				'error.message',
				'BlockHeaders are not contradicting as per BFT violation rules.',
			);
			await expect(pomCommand.verify(context)).resolves.toHaveProperty('status', VerifyStatus.FAIL);
		});

		it('should resolve without error when headers are valid, can be decoded and are contradicting', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
				}),
				header2: codec.encode(blockHeaderSchema, { ...header2 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);
			jest.spyOn(bftUtil, 'areDistinctHeadersContradicting').mockReturnValue(true);

			await expect(pomCommand.verify(context)).resolves.toHaveProperty('status', VerifyStatus.OK);
		});

		it('should not throw error when first height is equal to second height but equal maxHeightPrestaked', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					height: 10999,
					asset: { ...header1, maxHeightPrestaked: 1099 },
				}),
				header2: codec.encode(blockHeaderSchema, { ...header2, height: 10999 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).resolves.toHaveProperty('status', VerifyStatus.OK);
		});

		it('should not throw error when first height is greater than the second height but equal maxHeightPrestaked', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					height: 10999,
					asset: { ...header1, maxHeightPrestaked: 1099 },
				}),
				header2: codec.encode(blockHeaderSchema, { ...header2, height: 11999 }),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).not.toReject();
		});

		it("should not throw error when height is greater than the second header's maxHeightPreviouslyForged", async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					height: 120,
				}),
				header2: codec.encode(blockHeaderSchema, {
					...header2,
					height: 123,
					asset: { ...header1, maxHeightPreviouslyForged: 98 },
				}),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).not.toReject();
		});

		it('should not throw error when maxHeightPrestaked is greater than the second maxHeightPrestaked', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...header1,
					height: 133,
					asset: { ...header1, maxHeightPrestaked: 101 },
				}),
				header2: codec.encode(blockHeaderSchema, {
					...header2,
					height: 123,
					asset: { ...header1, maxHeightPrestaked: 98 },
				}),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			await expect(pomCommand.verify(context)).not.toReject();
		});
	});

	describe('execute', () => {
		const block1Height = blockHeight - 768;
		const block2Height = block1Height + 15;
		let transactionParamsPreDecoded: any;

		beforeEach(() => {
			jest.spyOn(BlockHeader.prototype, 'validateSignature').mockReturnValue(undefined);

			transactionParamsPreDecoded = {
				header1: { ...header1, height: block1Height },
				header2: { ...header2, height: block2Height },
			};
		});

		it('should not throw error with valid transactions', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.execute(context)).resolves.toBeUndefined();
		});

		it('should throw error if misbehaving account is not a validator', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, {
					...transactionParamsPreDecoded.header1,
					generatorAddress: utils.getRandomBytes(32),
				}),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.execute(context)).rejects.toThrow();
		});

		it('should reward the sender with 1 LSK if validator has enough balance', async () => {
			const remainingBalance = reportPunishmentReward + BigInt('10000000000');

			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			when(pomCommand['_tokenMethod'].getAvailableBalance as any)
				.calledWith(expect.anything(), validator1Address, DEFAULT_LOCAL_ID)
				.mockResolvedValue(remainingBalance as never);

			await pomCommand.execute(context);

			expect(pomCommand['_tokenMethod'].transfer).toHaveBeenCalledWith(
				expect.anything(),
				validator1Address,
				context.transaction.senderAddress,
				DEFAULT_LOCAL_ID,
				reportPunishmentReward,
			);
		});

		it('should not reward the sender if validator does not has enough minimum remaining balance', async () => {
			const remainingBalance = BigInt(100);

			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			when(pomCommand['_tokenMethod'].getAvailableBalance as any)
				.calledWith(expect.anything(), validator1Address, DEFAULT_LOCAL_ID)
				.mockResolvedValue(remainingBalance as never);

			await pomCommand.execute(context);

			// If amount is zero, it should not call the transfer
			expect(pomCommand['_tokenMethod'].transfer).not.toHaveBeenCalledWith(
				expect.anything(),
				validator1Address,
				context.transaction.senderAddress,
				DEFAULT_LOCAL_ID,
				BigInt(0),
			);
		});

		it('should add (remaining balance - min remaining balance) of validator to balance of the sender if validator balance is less than report punishment reward', async () => {
			const remainingBalance = reportPunishmentReward - BigInt(1);

			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			when(pomCommand['_tokenMethod'].getAvailableBalance as any)
				.calledWith(expect.anything(), validator1Address, DEFAULT_LOCAL_ID)
				.mockResolvedValue(remainingBalance as never);

			await pomCommand.execute(context);

			expect(pomCommand['_tokenMethod'].transfer).toHaveBeenCalledWith(
				expect.anything(),
				validator1Address,
				context.transaction.senderAddress,
				DEFAULT_LOCAL_ID,
				remainingBalance,
			);
		});

		it('should append height h to pomHeights property of misbehaving account', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await pomCommand.execute(context);

			const updatedValidator = await validatorSubstore.get(
				createStoreGetter(stateStore),
				validator1Address,
			);

			expect(updatedValidator.pomHeights).toEqual([blockHeight]);
		});

		it('should set isBanned property to true if pomHeights.length === 5', async () => {
			const pomHeights = [500, 1000, 2000, 4550];
			const updatedValidatorAccount = objects.cloneDeep(misBehavingValidator);
			updatedValidatorAccount.pomHeights = objects.cloneDeep(pomHeights);
			updatedValidatorAccount.isBanned = false;
			await validatorSubstore.set(
				createStoreGetter(stateStore),
				validator1Address,
				updatedValidatorAccount,
			);

			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await pomCommand.execute(context);

			const updatedValidator = await validatorSubstore.get(
				createStoreGetter(stateStore),
				validator1Address,
			);

			expect(updatedValidator.pomHeights).toEqual([...pomHeights, blockHeight]);
			expect(updatedValidator.pomHeights).toHaveLength(5);
			expect(updatedValidator.isBanned).toBeTrue();

			const events = context.eventQueue.getEvents();
			expect(events).toHaveLength(2);
			expect(events[1].toObject().name).toBe('validatorBanned');
		});

		it('should emit a ValidatorPunishedEvent', async () => {
			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await pomCommand.execute(context);

			const events = context.eventQueue.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].toObject().name).toBe('validatorPunished');
		});

		it('should not return balance if sender and validator account are same', async () => {
			transaction = new Transaction({
				module: 'pos',
				command: 'reportValidatorMisbehavior',
				senderPublicKey: validator1PublicKey,
				nonce: BigInt(0),
				fee: BigInt(100000000),
				params: Buffer.alloc(0),
				signatures: [validator1PublicKey],
			});

			transactionParamsDecoded = {
				header1: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header1),
				header2: codec.encode(blockHeaderSchema, transactionParamsPreDecoded.header2),
			};
			transactionParams = codec.encode(pomCommand.schema, transactionParamsDecoded);
			transaction.params = transactionParams;
			context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header,
				})
				.createCommandExecuteContext<PomTransactionParams>(pomCommand.schema);

			await expect(pomCommand.execute(context)).resolves.toBeUndefined();
		});
	});
});
