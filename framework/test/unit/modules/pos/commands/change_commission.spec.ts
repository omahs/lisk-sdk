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

import { Transaction } from '@liskhq/lisk-chain';
import { codec } from '@liskhq/lisk-codec';
import { utils } from '@liskhq/lisk-cryptography';
import * as testing from '../../../../../src/testing';
import { ChangeCommissionCommand } from '../../../../../src/modules/pos/commands/change_commission';
import { changeCommissionCommandParamsSchema as schema } from '../../../../../src/modules/pos/schemas';
import { ChangeCommissionParams } from '../../../../../src/modules/pos/types';
import { EventQueue, VerifyStatus } from '../../../../../src/state_machine';
import { PrefixedStateReadWriter } from '../../../../../src/state_machine/prefixed_state_read_writer';
import { InMemoryPrefixedStateDB } from '../../../../../src/testing/in_memory_prefixed_state';
import { ValidatorStore } from '../../../../../src/modules/pos/stores/validator';
import { PoSModule } from '../../../../../src';
import { createStoreGetter } from '../../../../../src/testing/utils';
import {
	COMMISSION_INCREASE_PERIOD,
	MAX_COMMISSION,
	MAX_COMMISSION_INCREASE_RATE,
} from '../../../../../src/modules/pos/constants';
import { createFakeBlockHeader } from '../../../../../src/testing';
import { CommissionChangeEvent } from '../../../../../src/modules/pos/events/commission_change';

describe('Change Commission command', () => {
	const pos = new PoSModule();
	const changeCommissionCommand = new ChangeCommissionCommand(pos.stores, pos.events);
	changeCommissionCommand.init({
		commissionIncreasePeriod: COMMISSION_INCREASE_PERIOD,
		maxCommissionIncreaseRate: MAX_COMMISSION_INCREASE_RATE,
	});

	let stateStore: PrefixedStateReadWriter;
	let validatorStore: ValidatorStore;
	let commissionChangedEvent: CommissionChangeEvent;

	const publicKey = utils.getRandomBytes(32);

	const validatorDetails = {
		name: 'PamelaAnderson',
		totalStakeReceived: BigInt(0),
		selfStake: BigInt(0),
		lastGeneratedHeight: 0,
		isBanned: false,
		pomHeights: [],
		consecutiveMissedBlocks: 0,
		commission: 100,
		lastCommissionIncreaseHeight: 0,
		sharingCoefficients: [],
	};

	const commandParams: ChangeCommissionParams = {
		newCommission: validatorDetails.commission + MAX_COMMISSION_INCREASE_RATE - 1,
	};
	const encodedCommandParams = codec.encode(schema, commandParams);
	const transactionDetails = {
		module: 'pos',
		command: changeCommissionCommand.name,
		senderPublicKey: publicKey,
		nonce: BigInt(0),
		fee: BigInt(100000000),
		params: encodedCommandParams,
		signatures: [publicKey],
	};
	let transaction = new Transaction(transactionDetails);

	// TODO: move this function to utils and import from all other tests using it
	const checkEventResult = (
		eventQueue: EventQueue,
		EventClass: any,
		moduleName: string,
		expectedResult: any,
		length = 1,
		index = 0,
	) => {
		expect(eventQueue.getEvents()).toHaveLength(length);
		expect(eventQueue.getEvents()[index].toObject().name).toEqual(new EventClass(moduleName).name);

		const eventData = codec.decode<Record<string, unknown>>(
			new EventClass(moduleName).schema,
			eventQueue.getEvents()[index].toObject().data,
		);

		expect(eventData).toEqual(expectedResult);
	};

	beforeEach(async () => {
		stateStore = new PrefixedStateReadWriter(new InMemoryPrefixedStateDB());
		validatorStore = pos.stores.get(ValidatorStore);

		await validatorStore.set(
			createStoreGetter(stateStore),
			transaction.senderAddress,
			validatorDetails,
		);

		commissionChangedEvent = pos.events.get(CommissionChangeEvent);
		jest.spyOn(commissionChangedEvent, 'log');
	});

	describe('verify', () => {
		it('should return status OK for valid params', async () => {
			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandVerifyContext<ChangeCommissionParams>(schema);

			const result = await changeCommissionCommand.verify(context);

			expect(result.status).toBe(VerifyStatus.OK);
		});

		it('should return error when changing commission of an unregistered validator', async () => {
			await validatorStore.del(createStoreGetter(stateStore), transaction.senderAddress);

			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandVerifyContext<ChangeCommissionParams>(schema);

			const result = await changeCommissionCommand.verify(context);

			expect(result.status).toBe(VerifyStatus.FAIL);
			expect(result.error?.message).toInclude(
				'Transaction sender has not registered as a validator.',
			);
		});

		it('should return error when changing commission before commission increase period has expired', async () => {
			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: 8 }),
				})
				.createCommandVerifyContext<ChangeCommissionParams>(schema);

			const result = await changeCommissionCommand.verify(context);

			expect(result.status).toBe(VerifyStatus.FAIL);
			expect(result.error?.message).toInclude(
				`Can only increase the commission again ${COMMISSION_INCREASE_PERIOD} blocks after the last commission increase.`,
			);
		});

		it('should return error when requested commission change is higher than allowed', async () => {
			commandParams.newCommission = validatorDetails.commission + MAX_COMMISSION_INCREASE_RATE + 1;
			transactionDetails.params = codec.encode(schema, commandParams);
			transaction = new Transaction(transactionDetails);

			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandVerifyContext<ChangeCommissionParams>(schema);

			const result = await changeCommissionCommand.verify(context);

			expect(result.status).toBe(VerifyStatus.FAIL);
			expect(result.error?.message).toInclude(
				`Invalid argument: Commission increase larger than ${MAX_COMMISSION_INCREASE_RATE}.`,
			);
		});

		it('should not allow the commission to be set higher than 100%', async () => {
			commandParams.newCommission = MAX_COMMISSION + 1;
			transactionDetails.params = codec.encode(schema, commandParams);
			transaction = new Transaction(transactionDetails);

			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandVerifyContext<ChangeCommissionParams>(schema);

			const result = await changeCommissionCommand.verify(context);

			expect(result.status).toBe(VerifyStatus.FAIL);
			expect(result.error?.message).toInclude(`must be <= ${MAX_COMMISSION}`);
		});
	});

	describe('execute', () => {
		it('should update last commission increase height in the validator store after INCREASING commission', async () => {
			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandExecuteContext<ChangeCommissionParams>(schema);

			await changeCommissionCommand.execute(context);
			const validator = await validatorStore.get(context, transaction.senderAddress);

			expect(validator.commission).toBe(commandParams.newCommission);
			expect(validator.lastCommissionIncreaseHeight).toBe(COMMISSION_INCREASE_PERIOD + 1);
		});

		it('should NOT update last commission increase height in the validator store after DECREASING commission', async () => {
			commandParams.newCommission = 50;
			transactionDetails.params = codec.encode(schema, commandParams);
			transaction = new Transaction(transactionDetails);

			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandExecuteContext<ChangeCommissionParams>(schema);

			await changeCommissionCommand.execute(context);
			const validator = await validatorStore.get(context, transaction.senderAddress);

			expect(validator.commission).toBe(commandParams.newCommission);
			expect(validator.lastCommissionIncreaseHeight).toBe(0);
		});

		it('should emit event after changing commission', async () => {
			const context = testing
				.createTransactionContext({
					stateStore,
					transaction,
					header: createFakeBlockHeader({ height: COMMISSION_INCREASE_PERIOD + 1 }),
				})
				.createCommandExecuteContext<ChangeCommissionParams>(schema);

			await changeCommissionCommand.execute(context);

			// check if the event has been dispatched correctly
			expect(commissionChangedEvent.log).toHaveBeenCalledWith(expect.anything(), {
				validatorAddress: transaction.senderAddress,
				oldCommission: validatorDetails.commission,
				newCommission: commandParams.newCommission,
			});

			// check if the event is in the event queue
			checkEventResult(context.eventQueue, CommissionChangeEvent, 'pos', {
				validatorAddress: transaction.senderAddress,
				oldCommission: validatorDetails.commission,
				newCommission: commandParams.newCommission,
			});
		});
	});
});
