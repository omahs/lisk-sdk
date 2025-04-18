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

import { address as cryptoAddress, utils } from '@liskhq/lisk-cryptography';
import { objects as objectUtils, dataStructures, objects } from '@liskhq/lisk-utils';
import { isUInt64, validator } from '@liskhq/lisk-validator';
import { codec } from '@liskhq/lisk-codec';
import { GenesisBlockExecuteContext, BlockAfterExecuteContext } from '../../state_machine';
import { BaseModule, ModuleInitArgs, ModuleMetadata } from '../base_module';
import { PoSMethod } from './method';
import { RegisterValidatorCommand } from './commands/register_validator';
import { ReportMisbehaviorCommand } from './commands/report_misbehavior';
import { UnlockCommand } from './commands/unlock';
import { UpdateGeneratorKeyCommand } from './commands/update_generator_key';
import { StakeCommand } from './commands/stake';
import { ChangeCommissionCommand } from './commands/change_commission';
import {
	VALIDATOR_LIST_ROUND_OFFSET,
	EMPTY_KEY,
	MAX_NUMBER_SENT_STAKES,
	MAX_NUMBER_PENDING_UNLOCKS,
	defaultConfig,
	MAX_CAP,
} from './constants';
import { PoSEndpoint } from './endpoint';
import {
	configSchema,
	genesisStoreSchema,
	getAllValidatorsResponseSchema,
	getClaimableRewardsRequestSchema,
	getClaimableRewardsResponseSchema,
	getValidatorRequestSchema,
	getValidatorResponseSchema,
	getPoSTokenIDResponseSchema,
	getLockedRewardRequestSchema,
	getLockedRewardResponseSchema,
	getLockedStakedAmountRequestSchema,
	getLockedStakedAmountResponseSchema,
	getPendingUnlocksRequestSchema,
	getPendingUnlocksResponseSchema,
	getValidatorsByStakeRequestSchema,
	getValidatorsByStakeResponseSchema,
	getStakerRequestSchema,
	getStakerResponseSchema,
} from './schemas';
import {
	RandomMethod,
	TokenMethod,
	ValidatorsMethod,
	GenesisStore,
	ModuleConfigJSON,
	ModuleConfig,
	FeeMethod,
} from './types';
import { Rounds } from './rounds';
import {
	equalUnlocking,
	isUsername,
	selectStandbyValidators,
	shuffleValidatorList,
	sortUnlocking,
	getModuleConfig,
	getValidatorWeight,
	ValidatorWeight,
	isSharingCoefficientSorted,
} from './utils';
import { ValidatorStore } from './stores/validator';
import { GenesisDataStore } from './stores/genesis';
import { NameStore } from './stores/name';
import { PreviousTimestampStore } from './stores/previous_timestamp';
import { SnapshotStore, SnapshotStoreData } from './stores/snapshot';
import { StakerStore } from './stores/staker';
import { EligibleValidatorsStore } from './stores/eligible_validators';
import { ValidatorBannedEvent } from './events/validator_banned';
import { ValidatorPunishedEvent } from './events/validator_punished';
import { ValidatorRegisteredEvent } from './events/validator_registered';
import { ValidatorStakedEvent } from './events/validator_staked';
import { InternalMethod } from './internal_method';
import { CommissionChangeEvent } from './events/commission_change';
import { ClaimRewardsCommand } from './commands/claim_rewards';

export class PoSModule extends BaseModule {
	public method = new PoSMethod(this.stores, this.events);
	public configSchema = configSchema;
	public endpoint = new PoSEndpoint(this.stores, this.offchainStores);

	private readonly _registerValidatorCommand = new RegisterValidatorCommand(
		this.stores,
		this.events,
	);
	private readonly _reportMisbehaviorCommand = new ReportMisbehaviorCommand(
		this.stores,
		this.events,
	);
	private readonly _unlockCommand = new UnlockCommand(this.stores, this.events);
	private readonly _updateGeneratorKeyCommand = new UpdateGeneratorKeyCommand(
		this.stores,
		this.events,
	);
	private readonly _stakeCommand = new StakeCommand(this.stores, this.events);
	private readonly _changeCommissionCommand = new ChangeCommissionCommand(this.stores, this.events);
	private readonly _claimRewardsCommand = new ClaimRewardsCommand(this.stores, this.events);

	// eslint-disable-next-line @typescript-eslint/member-ordering
	public commands = [
		this._registerValidatorCommand,
		this._reportMisbehaviorCommand,
		this._unlockCommand,
		this._updateGeneratorKeyCommand,
		this._stakeCommand,
		this._changeCommissionCommand,
		this._claimRewardsCommand,
	];

	private readonly _internalMethod = new InternalMethod(this.stores, this.events, this.name);
	private _randomMethod!: RandomMethod;
	private _validatorsMethod!: ValidatorsMethod;
	private _tokenMethod!: TokenMethod;
	private _feeMethod!: FeeMethod;
	private _moduleConfig!: ModuleConfig;

	public constructor() {
		super();
		this.stores.register(ValidatorStore, new ValidatorStore(this.name));
		this.stores.register(GenesisDataStore, new GenesisDataStore(this.name));
		this.stores.register(NameStore, new NameStore(this.name));
		this.stores.register(PreviousTimestampStore, new PreviousTimestampStore(this.name));
		this.stores.register(SnapshotStore, new SnapshotStore(this.name));
		this.stores.register(StakerStore, new StakerStore(this.name));
		this.stores.register(EligibleValidatorsStore, new EligibleValidatorsStore(this.name));

		this.events.register(ValidatorBannedEvent, new ValidatorBannedEvent(this.name));
		this.events.register(ValidatorPunishedEvent, new ValidatorPunishedEvent(this.name));
		this.events.register(ValidatorRegisteredEvent, new ValidatorRegisteredEvent(this.name));
		this.events.register(ValidatorStakedEvent, new ValidatorStakedEvent(this.name));
		this.events.register(CommissionChangeEvent, new CommissionChangeEvent(this.name));
	}

	public get name() {
		return 'pos';
	}

	public addDependencies(
		randomMethod: RandomMethod,
		validatorsMethod: ValidatorsMethod,
		tokenMethod: TokenMethod,
		feeMethod: FeeMethod,
	) {
		this._randomMethod = randomMethod;
		this._validatorsMethod = validatorsMethod;
		this._tokenMethod = tokenMethod;
		this._feeMethod = feeMethod;

		this._registerValidatorCommand.addDependencies(this._validatorsMethod, this._feeMethod);
		this._reportMisbehaviorCommand.addDependencies({
			tokenMethod: this._tokenMethod,
			validatorsMethod: this._validatorsMethod,
		});
		this._unlockCommand.addDependencies({
			tokenMethod: this._tokenMethod,
		});
		this._updateGeneratorKeyCommand.addDependencies(this._validatorsMethod);
		this._stakeCommand.addDependencies({
			tokenMethod: this._tokenMethod,
			internalMethod: this._internalMethod,
		});
		this._claimRewardsCommand.addDependencies({
			internalMethod: this._internalMethod,
		});
	}

	public metadata(): ModuleMetadata {
		return {
			endpoints: [
				{
					name: this.endpoint.getAllValidators.name,
					response: getAllValidatorsResponseSchema,
				},
				{
					name: this.endpoint.getValidator.name,
					request: getValidatorRequestSchema,
					response: getValidatorResponseSchema,
				},
				{
					name: this.endpoint.getStaker.name,
					request: getStakerRequestSchema,
					response: getStakerResponseSchema,
				},
				{
					name: this.endpoint.getConstants.name,
					response: configSchema,
				},
				{
					name: this.endpoint.getPoSTokenID.name,
					response: getPoSTokenIDResponseSchema,
				},
				{
					name: this.endpoint.getClaimableRewards.name,
					request: getClaimableRewardsRequestSchema,
					response: getClaimableRewardsResponseSchema,
				},
				{
					name: this.endpoint.getClaimableRewards.name,
					request: getClaimableRewardsRequestSchema,
					response: getClaimableRewardsResponseSchema,
				},
				{
					name: this.endpoint.getLockedReward.name,
					request: getLockedRewardRequestSchema,
					response: getLockedRewardResponseSchema,
				},
				{
					name: this.endpoint.getLockedStakedAmount.name,
					request: getLockedStakedAmountRequestSchema,
					response: getLockedStakedAmountResponseSchema,
				},
				{
					name: this.endpoint.getValidatorsByStake.name,
					request: getValidatorsByStakeRequestSchema,
					response: getValidatorsByStakeResponseSchema,
				},
				{
					name: this.endpoint.getPendingUnlocks.name,
					request: getPendingUnlocksRequestSchema,
					response: getPendingUnlocksResponseSchema,
				},
			],
			commands: this.commands.map(command => ({
				name: command.name,
				params: command.schema,
			})),
			events: [],
			assets: [
				{
					version: 0,
					data: genesisStoreSchema,
				},
			],
		};
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async init(args: ModuleInitArgs) {
		const { moduleConfig } = args;
		const defaultPoSTokenID = `${args.genesisConfig.chainID}${Buffer.alloc(4).toString('hex')}`;
		const config = objects.mergeDeep(
			{},
			{
				...defaultConfig,
				posTokenID: defaultPoSTokenID,
			},
			moduleConfig,
		) as ModuleConfigJSON;
		validator.validate(configSchema, config);

		this._moduleConfig = getModuleConfig(config);

		this.method.init(this.name, this._moduleConfig, this._tokenMethod);
		this.endpoint.init(this.name, this._moduleConfig, this._tokenMethod);

		this._reportMisbehaviorCommand.init({
			posTokenID: this._moduleConfig.posTokenID,
			factorSelfStakes: this._moduleConfig.factorSelfStakes,
		});
		this._registerValidatorCommand.init({
			validatorRegistrationFee: this._moduleConfig.validatorRegistrationFee,
		});
		this._unlockCommand.init({
			posTokenID: this._moduleConfig.posTokenID,
			roundLength: this._moduleConfig.roundLength,
		});
		this._stakeCommand.init({
			posTokenID: this._moduleConfig.posTokenID,
			factorSelfStakes: BigInt(this._moduleConfig.factorSelfStakes),
		});
		this._changeCommissionCommand.init({
			commissionIncreasePeriod: this._moduleConfig.commissionIncreasePeriod,
			maxCommissionIncreaseRate: this._moduleConfig.maxCommissionIncreaseRate,
		});

		this.stores.get(EligibleValidatorsStore).init(this._moduleConfig);
		this._stakeCommand.init({
			posTokenID: this._moduleConfig.posTokenID,
			factorSelfStakes: BigInt(this._moduleConfig.factorSelfStakes),
		});
	}

	public async initGenesisState(context: GenesisBlockExecuteContext): Promise<void> {
		const assetBytes = context.assets.getAsset(this.name);
		// if there is no asset, do not initialize
		if (!assetBytes) {
			return;
		}
		const genesisStore = codec.decode<GenesisStore>(genesisStoreSchema, assetBytes);
		validator.validate(genesisStoreSchema, genesisStore);

		// validators property check
		const posValidatorAddresses = [];
		const posValidatorNames = [];
		const posValidatorAddressMap = new dataStructures.BufferMap<GenesisStore['validators'][0]>();
		for (const posValidator of genesisStore.validators) {
			if (!isUsername(posValidator.name)) {
				throw new Error(`Invalid validator name ${posValidator.name}.`);
			}
			if (posValidator.lastCommissionIncreaseHeight > context.header.height) {
				throw new Error(
					`Invalid lastCommissionIncreaseHeight ${
						posValidator.lastCommissionIncreaseHeight
					} for ${cryptoAddress.getLisk32AddressFromAddress(posValidator.address)}.`,
				);
			}
			// sharingCoefficients must be sorted by tokenID
			if (!isSharingCoefficientSorted(posValidator.sharingCoefficients)) {
				throw new Error('SharingCoefficients must be sorted by tokenID.');
			}

			posValidatorAddressMap.set(posValidator.address, posValidator);
			posValidatorAddresses.push(posValidator.address);
			posValidatorNames.push(posValidator.name);
		}
		if (!objectUtils.bufferArrayUniqueItems(posValidatorAddresses)) {
			throw new Error('Validator address is not unique.');
		}
		if (new Set(posValidatorNames).size !== posValidatorNames.length) {
			throw new Error('Validator name is not unique.');
		}
		// stakers property check
		const stakerAddresses = [];
		for (const staker of genesisStore.stakers) {
			if (staker.sentStakes.length > MAX_NUMBER_SENT_STAKES) {
				throw new Error(`Sent stake exceeds max stake ${MAX_NUMBER_SENT_STAKES}.`);
			}
			if (!objectUtils.bufferArrayUniqueItems(staker.sentStakes.map(v => v.validatorAddress))) {
				throw new Error('Sent stake validator address is not unique.');
			}
			if (!objectUtils.bufferArrayOrderByLex(staker.sentStakes.map(v => v.validatorAddress))) {
				throw new Error('Sent stake validator address is not lexicographically ordered.');
			}
			for (const stakes of staker.sentStakes) {
				const posValidator = posValidatorAddressMap.get(stakes.validatorAddress);
				if (!posValidator) {
					throw new Error('Sent stake includes non existing validator address.');
				}
				for (const sharingCoefficient of stakes.stakeSharingCoefficients) {
					const targetCoefficient = posValidator.sharingCoefficients.find(co =>
						co.tokenID.equals(sharingCoefficient.tokenID),
					);
					if (
						!targetCoefficient ||
						sharingCoefficient.coefficient.compare(targetCoefficient.coefficient) > 0
					) {
						throw new Error(
							'Validator does not have corresponding sharing coefficient or the coefficient value is not consistent.',
						);
					}
				}
				// sharingCoefficients must be sorted by tokenID
				if (!isSharingCoefficientSorted(stakes.stakeSharingCoefficients)) {
					throw new Error('stakeSharingCoefficients must be sorted by tokenID.');
				}
			}

			if (staker.pendingUnlocks.length > MAX_NUMBER_PENDING_UNLOCKS) {
				throw new Error(`PendingUnlocks exceeds max unlocking ${MAX_NUMBER_PENDING_UNLOCKS}.`);
			}
			const sortingPendingUnlocks = [...staker.pendingUnlocks];
			sortUnlocking(sortingPendingUnlocks);
			for (let i = 0; i < staker.pendingUnlocks.length; i += 1) {
				const original = staker.pendingUnlocks[i];
				const target = sortingPendingUnlocks[i];
				if (!equalUnlocking(original, target)) {
					throw new Error('PendingUnlocks are not lexicographically ordered.');
				}
			}
			if (staker.pendingUnlocks.some(v => !posValidatorAddressMap.has(v.validatorAddress))) {
				throw new Error('Pending unlocks includes non existing validator address.');
			}
			stakerAddresses.push(staker.address);
		}
		if (!objectUtils.bufferArrayUniqueItems(stakerAddresses)) {
			throw new Error('Staker address is not unique.');
		}
		// check genesis state
		if (!objectUtils.bufferArrayUniqueItems(genesisStore.genesisData.initValidators)) {
			throw new Error('Init validators address is not unique.');
		}
		if (genesisStore.genesisData.initValidators.some(v => !posValidatorAddressMap.has(v))) {
			throw new Error('Init validators includes non existing validator address.');
		}
		if (
			genesisStore.genesisData.initValidators.length > this._moduleConfig.numberActiveValidators
		) {
			throw new Error(
				`Init validators is greater than number of active validators ${this._moduleConfig.numberActiveValidators}.`,
			);
		}

		const stakerStore = this.stores.get(StakerStore);
		const stakeMap = new dataStructures.BufferMap<{ selfStake: bigint; stakeReceived: bigint }>();
		for (const staker of genesisStore.stakers) {
			for (const sentStake of staker.sentStakes) {
				const validatorData = stakeMap.get(sentStake.validatorAddress) ?? {
					selfStake: BigInt(0),
					stakeReceived: BigInt(0),
				};
				validatorData.stakeReceived += sentStake.amount;
				if (!isUInt64(validatorData.stakeReceived)) {
					throw new Error('Stakes received out of range.');
				}
				if (sentStake.validatorAddress.equals(staker.address)) {
					validatorData.selfStake += sentStake.amount;
					if (!isUInt64(validatorData.selfStake)) {
						throw new Error('Self stake out of range.');
					}
				}
				stakeMap.set(sentStake.validatorAddress, validatorData);
			}
			await stakerStore.set(context, staker.address, {
				sentStakes: staker.sentStakes,
				pendingUnlocks: staker.pendingUnlocks,
			});
		}

		const validatorStore = this.stores.get(ValidatorStore);
		const nameSubstore = this.stores.get(NameStore);
		for (const posValidator of genesisStore.validators) {
			const stakeInfo = stakeMap.get(posValidator.address) ?? {
				selfStake: BigInt(0),
				stakeReceived: BigInt(0),
			};
			await validatorStore.set(context, posValidator.address, {
				name: posValidator.name,
				totalStakeReceived: stakeInfo.stakeReceived,
				selfStake: stakeInfo.selfStake,
				lastGeneratedHeight: posValidator.lastGeneratedHeight,
				isBanned: posValidator.isBanned,
				pomHeights: posValidator.pomHeights,
				consecutiveMissedBlocks: posValidator.consecutiveMissedBlocks,
				commission: posValidator.commission,
				lastCommissionIncreaseHeight: posValidator.lastCommissionIncreaseHeight,
				sharingCoefficients: posValidator.sharingCoefficients,
			});
			await nameSubstore.set(context, Buffer.from(posValidator.name, 'utf-8'), {
				validatorAddress: posValidator.address,
			});
		}

		const previousTimestampStore = this.stores.get(PreviousTimestampStore);
		await previousTimestampStore.set(context, EMPTY_KEY, {
			timestamp: context.header.timestamp,
		});

		const genesisDataStore = this.stores.get(GenesisDataStore);
		await genesisDataStore.set(context, EMPTY_KEY, {
			height: context.header.height,
			initRounds: genesisStore.genesisData.initRounds,
			initValidators: genesisStore.genesisData.initValidators,
		});
	}

	public async finalizeGenesisState(context: GenesisBlockExecuteContext): Promise<void> {
		const assetBytes = context.assets.getAsset(this.name);
		// if there is no asset, do not initialize
		if (!assetBytes) {
			return;
		}
		const genesisStore = codec.decode<GenesisStore>(genesisStoreSchema, assetBytes);
		const methodContext = context.getMethodContext();
		for (const posValidator of genesisStore.validators) {
			const valid = await this._validatorsMethod.registerValidatorKeys(
				methodContext,
				posValidator.address,
				posValidator.blsKey,
				posValidator.generatorKey,
				posValidator.proofOfPossession,
			);
			if (!valid) {
				throw new Error('Invalid validator key.');
			}
		}
		const stakerStore = this.stores.get(StakerStore);
		const allStakers = await stakerStore.iterate(context, {
			gte: Buffer.alloc(20),
			lte: Buffer.alloc(20, 255),
		});
		for (const stakerData of allStakers) {
			let stakedAmount = BigInt(0);
			for (const sentStakes of stakerData.value.sentStakes) {
				stakedAmount += sentStakes.amount;
			}
			for (const pendingUnlock of stakerData.value.pendingUnlocks) {
				stakedAmount += pendingUnlock.amount;
			}
			const lockedAmount = await this._tokenMethod.getLockedAmount(
				methodContext,
				stakerData.key,
				this._moduleConfig.posTokenID,
				this.name,
			);
			if (lockedAmount !== stakedAmount) {
				throw new Error('Staked amount is not locked');
			}
		}

		const initValidators = [...genesisStore.genesisData.initValidators];
		initValidators.sort((a, b) => a.compare(b));
		const validators = [];
		let aggregateBFTWeight = BigInt(0);
		for (const validatorAddress of initValidators) {
			validators.push({
				address: validatorAddress,
				bftWeight: BigInt(1),
			});
			aggregateBFTWeight += BigInt(1);
		}
		const precommitThreshold = (BigInt(2) * aggregateBFTWeight) / BigInt(3) + BigInt(1);
		const certificateThreshold = precommitThreshold;
		await this._validatorsMethod.setValidatorsParams(
			context.getMethodContext(),
			context,
			precommitThreshold,
			certificateThreshold,
			validators,
		);
	}

	public async afterTransactionsExecute(context: BlockAfterExecuteContext): Promise<void> {
		const { header } = context;
		const isLastBlockOfRound = await this.method.isEndOfRound(
			context.getMethodContext(),
			header.height,
		);
		const previousTimestampStore = this.stores.get(PreviousTimestampStore);
		const previousTimestampData = await previousTimestampStore.get(context, EMPTY_KEY);
		const { timestamp: previousTimestamp } = previousTimestampData;

		await this._updateProductivity(context, previousTimestamp);

		if (isLastBlockOfRound) {
			await this._createStakeWeightSnapshot(context);
		}

		const didBootstrapRoundsEnd = await this._didBootstrapRoundsEnd(context);
		if (isLastBlockOfRound && didBootstrapRoundsEnd) {
			await this._updateValidators(context);
		}

		await previousTimestampStore.set(context, EMPTY_KEY, { timestamp: header.timestamp });
	}

	private async _createStakeWeightSnapshot(context: BlockAfterExecuteContext): Promise<void> {
		const snapshotHeight = context.header.height + 1;
		const round = new Rounds({ blocksPerRound: this._moduleConfig.roundLength });
		const snapshotRound = round.calcRound(snapshotHeight) + VALIDATOR_LIST_ROUND_OFFSET;
		context.logger.debug(`Creating stake weight snapshot for round: ${snapshotRound.toString()}`);

		const eligibleValidatorStore = this.stores.get(EligibleValidatorsStore);
		const eligibleValidatorsList = await eligibleValidatorStore.getAll(context);
		const validatorWeightSnapshot = [];
		for (const { key, value } of eligibleValidatorsList) {
			if (
				value.lastPomHeight === 0 ||
				value.lastPomHeight < snapshotHeight - this._moduleConfig.punishmentWindow
			) {
				const [address, weight] = eligibleValidatorStore.splitKey(key);
				validatorWeightSnapshot.push({ address, weight });
			}
		}

		const snapshotData: SnapshotStoreData = {
			validatorWeightSnapshot,
		};

		const snapshotStore = this.stores.get(SnapshotStore);
		const storeKey = utils.intToBuffer(snapshotRound, 4);

		await snapshotStore.set(context, storeKey, snapshotData);

		// Remove outdated information
		const oldData = await snapshotStore.iterate(context, {
			gte: utils.intToBuffer(0, 4),
			lte: utils.intToBuffer(Math.max(0, snapshotRound - VALIDATOR_LIST_ROUND_OFFSET - 1), 4),
		});
		for (const { key } of oldData) {
			await snapshotStore.del(context, key);
		}
	}

	private async _updateValidators(context: BlockAfterExecuteContext): Promise<void> {
		const round = new Rounds({ blocksPerRound: this._moduleConfig.roundLength });
		const { height } = context.header;
		const nextRound = round.calcRound(height) + 1;
		context.logger.debug(nextRound, 'Updating validator list for');

		const snapshotStore = this.stores.get(SnapshotStore);
		const snapshot = await snapshotStore.get(context, utils.intToBuffer(nextRound, 4));
		const genesisData = await this.stores.get(GenesisDataStore).get(context, EMPTY_KEY);

		const methodContext = context.getMethodContext();
		const activeValidators = await this._getActiveValidators(
			context,
			snapshot.validatorWeightSnapshot,
			nextRound,
		);
		const validators = [];
		const activeValidatorMap = new dataStructures.BufferMap<boolean>();
		for (const v of activeValidators) {
			activeValidatorMap.set(v.address, true);
			validators.push(v);
		}

		const randomSeed1 = await this._randomMethod.getRandomBytes(
			methodContext,
			height + 1 - Math.floor((this._moduleConfig.roundLength * 3) / 2),
			this._moduleConfig.roundLength,
		);
		// select standby validators
		let standbyValidators: ValidatorWeight[] = [];
		if (nextRound > genesisData.initRounds + this._moduleConfig.numberActiveValidators) {
			const candidates = snapshot.validatorWeightSnapshot.filter(
				v => !activeValidatorMap.has(v.address),
			);
			if (this._moduleConfig.numberStandbyValidators === 2) {
				const randomSeed2 = await this._randomMethod.getRandomBytes(
					methodContext,
					height + 1 - 2 * this._moduleConfig.roundLength,
					this._moduleConfig.roundLength,
				);
				standbyValidators = selectStandbyValidators(candidates, randomSeed1, randomSeed2);
				validators.push(...standbyValidators);
			} else if (this._moduleConfig.numberStandbyValidators === 1) {
				standbyValidators = selectStandbyValidators(candidates, randomSeed1);
				validators.push(...standbyValidators);
			}
		}
		// if there is no validator, then no update
		if (validators.length === 0) {
			return;
		}

		// Update the validators
		const shuffledValidators = shuffleValidatorList(randomSeed1, validators);
		let aggregateBFTWeight = BigInt(0);
		const bftValidators: { address: Buffer; bftWeight: bigint }[] = [];
		for (const v of shuffledValidators) {
			aggregateBFTWeight += v.weight;
			bftValidators.push({
				address: v.address,
				bftWeight: v.weight,
			});
		}
		const precommitThreshold = (BigInt(2) * aggregateBFTWeight) / BigInt(3) + BigInt(1);
		const certificateThreshold = precommitThreshold;
		await this._validatorsMethod.setValidatorsParams(
			context.getMethodContext(),
			context,
			precommitThreshold,
			certificateThreshold,
			bftValidators,
		);
	}

	private async _updateProductivity(context: BlockAfterExecuteContext, previousTimestamp: number) {
		const { logger, header, getMethodContext } = context;

		const round = new Rounds({ blocksPerRound: this._moduleConfig.roundLength });
		logger.debug(round, 'Updating validators productivity for round');

		const newHeight = header.height;
		const methodContext = getMethodContext();
		const missedBlocks = await this._validatorsMethod.getGeneratorsBetweenTimestamps(
			methodContext,
			previousTimestamp,
			header.timestamp,
		);

		const validatorStore = this.stores.get(ValidatorStore);
		const eligibleValidatorStore = this.stores.get(EligibleValidatorsStore);
		for (const addressString of Object.keys(missedBlocks)) {
			const address = Buffer.from(addressString, 'binary');
			const validatorData = await validatorStore.get(context, address);
			validatorData.consecutiveMissedBlocks += missedBlocks[addressString];
			if (
				validatorData.consecutiveMissedBlocks > this._moduleConfig.failSafeMissedBlocks &&
				newHeight - validatorData.lastGeneratedHeight > this._moduleConfig.failSafeInactiveWindow
			) {
				validatorData.isBanned = true;
				await eligibleValidatorStore.update(
					context,
					address,
					getValidatorWeight(
						BigInt(this._moduleConfig.factorSelfStakes),
						validatorData.selfStake,
						validatorData.totalStakeReceived,
					),
					validatorData,
				);
			}

			await validatorStore.set(context, address, validatorData);
		}

		const generator = await validatorStore.get(context, header.generatorAddress);
		generator.consecutiveMissedBlocks = 0;
		generator.lastGeneratedHeight = newHeight;
		await validatorStore.set(context, header.generatorAddress, generator);
	}

	private async _didBootstrapRoundsEnd(context: BlockAfterExecuteContext) {
		const { header } = context;
		const rounds = new Rounds({ blocksPerRound: this._moduleConfig.roundLength });
		const genesisDataStore = this.stores.get(GenesisDataStore);
		const genesisData = await genesisDataStore.get(context, EMPTY_KEY);
		const { initRounds } = genesisData;
		const nextHeightRound = rounds.calcRound(header.height + 1);

		return nextHeightRound > initRounds;
	}

	// _getActiveValidators assumes to be called after initRounds is passed
	// snapshotValidators is expected to be sorted desc by weight
	private async _getActiveValidators(
		context: BlockAfterExecuteContext,
		snapshotValidators: SnapshotStoreData['validatorWeightSnapshot'],
		round: number,
	): Promise<ValidatorWeight[]> {
		const genesisData = await this.stores.get(GenesisDataStore).get(context, EMPTY_KEY);
		// After initRounds, each round introduce one new slot for selected validators
		if (round < genesisData.initRounds + this._moduleConfig.numberActiveValidators) {
			const numInitValidators =
				genesisData.initRounds + this._moduleConfig.numberActiveValidators - round;
			const numElectedValidators = this._moduleConfig.numberActiveValidators - numInitValidators;
			const activeValidators = snapshotValidators.slice(0, numElectedValidators);
			for (const address of genesisData.initValidators) {
				// when activeValidator is filled, don't add anymore
				if (activeValidators.length === this._moduleConfig.numberActiveValidators) {
					break;
				}
				// it should not add duplicate address
				if (activeValidators.findIndex(d => d.address.equals(address)) > -1) {
					continue;
				}
				activeValidators.push({ address, weight: BigInt(1) });
			}
			return activeValidators;
		}
		// Validator selection is out of init rounds
		const activeValidators =
			snapshotValidators.length > this._moduleConfig.numberActiveValidators
				? snapshotValidators.slice(0, this._moduleConfig.numberActiveValidators)
				: snapshotValidators;
		// No capping is required
		const capValue = this._moduleConfig.maxBFTWeightCap;
		if (activeValidators.length < Math.ceil(MAX_CAP / capValue)) {
			return activeValidators;
		}
		// cap the weights
		return this._capWeight(activeValidators, this._moduleConfig.maxBFTWeightCap);
	}

	private _capWeight(validators: ValidatorWeight[], capValue: number) {
		const maxCappedElements = Math.ceil(MAX_CAP / capValue) - 1;
		let partialSum = BigInt(0);
		for (let i = maxCappedElements + 1; i < validators.length; i += 1) {
			partialSum += validators[i].weight;
		}
		for (let i = maxCappedElements; i > 0; i -= 1) {
			partialSum += validators[i].weight;
			const cappedWeightRemainingElements =
				(BigInt(capValue) * partialSum) /
				BigInt(100) /
				(BigInt(100) - BigInt(capValue * i) / BigInt(100));
			if (cappedWeightRemainingElements < validators[i - 1].weight) {
				for (let j = 0; j < i; j += 1) {
					// eslint-disable-next-line no-param-reassign
					validators[j].weight = cappedWeightRemainingElements;
				}
				return validators;
			}
		}
		return validators;
	}
}
