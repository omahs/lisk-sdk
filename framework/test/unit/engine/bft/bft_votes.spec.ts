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

import { StateStore } from '@liskhq/lisk-chain';
import { utils } from '@liskhq/lisk-cryptography';
import { InMemoryDatabase } from '@liskhq/lisk-db';
import { objects } from '@liskhq/lisk-utils';
import { BFTParametersCache } from '../../../../src/engine/bft/bft_params';
import {
	getHeightNotPrevoted,
	insertBlockBFTInfo,
	updateMaxHeightCertified,
	updateMaxHeightPrecommitted,
	updateMaxHeightPrevoted,
	updatePrevotesPrecommits,
} from '../../../../src/engine/bft/bft_votes';
import {
	MODULE_STORE_PREFIX_BFT,
	STORE_PREFIX_BFT_PARAMETERS,
} from '../../../../src/engine/bft/constants';
import { bftParametersSchema, BFTVotes } from '../../../../src/engine/bft/schemas';
import { createFakeBlockHeader } from '../../../../src/testing';

describe('BFT votes', () => {
	let accounts: Buffer[];
	let bftVotes: BFTVotes;

	beforeEach(() => {
		accounts = [utils.getRandomBytes(20), utils.getRandomBytes(20), utils.getRandomBytes(20)];
		bftVotes = {
			maxHeightPrevoted: 103,
			maxHeightPrecommitted: 56,
			maxHeightCertified: 5,
			blockBFTInfos: [
				{
					generatorAddress: accounts[0],
					height: 151,
					maxHeightGenerated: 148,
					maxHeightPrevoted: 148,
					precommitWeight: BigInt(64),
					prevoteWeight: BigInt(65),
				},
				{
					generatorAddress: accounts[1],
					height: 150,
					maxHeightGenerated: 101,
					maxHeightPrevoted: 104,
					precommitWeight: BigInt(64),
					prevoteWeight: BigInt(65),
				},
				{
					generatorAddress: accounts[2],
					height: 149,
					maxHeightGenerated: 149,
					maxHeightPrevoted: 104,
					precommitWeight: BigInt(64),
					prevoteWeight: BigInt(68),
				},
				{
					generatorAddress: accounts[0],
					height: 148,
					maxHeightGenerated: 101,
					maxHeightPrevoted: 104,
					precommitWeight: BigInt(67),
					prevoteWeight: BigInt(68),
				},
			],
			activeValidatorsVoteInfo: [
				{
					address: accounts[0],
					largestHeightPrecommit: 140,
					minActiveHeight: 0,
				},
				{
					address: accounts[1],
					largestHeightPrecommit: 0,
					minActiveHeight: 101,
				},
				{
					address: accounts[2],
					largestHeightPrecommit: 0,
					minActiveHeight: 149,
				},
			],
		};
	});

	describe('insertBlockBFTInfo', () => {
		it('should insert the new block at the first index', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 150,
					generatorAddress: accounts[1],
				}),
				5,
			);

			expect(bftVotes.blockBFTInfos).toHaveLength(5);
			expect(bftVotes.blockBFTInfos[0].height).toBe(152);
		});

		it('should not increase the size of bftBlockInfo if exceeds bftBlockInfo', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 150,
					generatorAddress: accounts[1],
				}),
				3,
			);

			expect(bftVotes.blockBFTInfos).toHaveLength(3);
			expect(bftVotes.blockBFTInfos[0].height).toBe(152);
		});

		it('should add to the bftBlockInfo if there is a space', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 150,
					generatorAddress: accounts[1],
				}),
				10,
			);

			expect(bftVotes.blockBFTInfos).toHaveLength(5);
			expect(bftVotes.blockBFTInfos[0].height).toBe(152);
		});
	});

	describe('getHeightNotPrevoted', () => {
		it('should return the maxHeight generated when the block at maxHeightGenerated height is generated by different validator', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 149,
					generatorAddress: utils.getRandomBytes(20),
				}),
				5,
			);
			expect(getHeightNotPrevoted(bftVotes)).toBe(149);
		});

		it('should return the maxHeight generated when the latest block has smaller maxHeightGenerated', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 149,
					generatorAddress: accounts[2],
				}),
				5,
			);
			expect(getHeightNotPrevoted(bftVotes)).toBe(149);
		});

		it('should return the (minimum height - 1) when the generator earliest forged is out of BFT range', () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 151,
					generatorAddress: accounts[0],
				}),
				5,
			);
			expect(getHeightNotPrevoted(bftVotes)).toBe(147);
		});
	});

	describe('updatePrevotesPrecommits', () => {
		let paramsCache: BFTParametersCache;

		beforeEach(async () => {
			const stateStore = new StateStore(new InMemoryDatabase());
			const paramsStore = stateStore.getStore(MODULE_STORE_PREFIX_BFT, STORE_PREFIX_BFT_PARAMETERS);
			await paramsStore.setWithSchema(
				utils.intToBuffer(101, 4),
				{
					prevoteThreshold: BigInt(68),
					precommitThreshold: BigInt(68),
					certificateThreshold: BigInt(68),
					validators: [
						{
							address: accounts[0],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[1],
							bftWeight: BigInt(0),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[2],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
					],
					validatorsHash: utils.getRandomBytes(32),
				},
				bftParametersSchema,
			);
			paramsCache = new BFTParametersCache(paramsStore);
		});

		it('should accept and not do anything for empty BFTVotes', async () => {
			jest.spyOn(paramsCache, 'getParameters');
			await expect(
				updatePrevotesPrecommits(
					{
						...bftVotes,
						blockBFTInfos: [],
					},
					paramsCache,
				),
			).toResolve();
			expect(paramsCache.getParameters).not.toHaveBeenCalled();
		});

		it('should not stake on blocks if generator is not in the validators', async () => {
			jest.spyOn(paramsCache, 'getParameters');
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 151,
					generatorAddress: utils.getRandomBytes(20),
				}),
				5,
			);
			const originalBFTVVotes = objects.cloneDeep(bftVotes);

			await updatePrevotesPrecommits(bftVotes, paramsCache);

			expect(paramsCache.getParameters).not.toHaveBeenCalled();
			expect(originalBFTVVotes).toEqual(bftVotes);
		});

		it('should increment precommit for larger than largetHeightPrecommit+1 when next block implies prevote', async () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 151,
					generatorAddress: accounts[0],
				}),
				5,
			);
			// accounts[0] has minPrecommitHeight is largestHeightPrecommit + 1 (149). heightNotPrevoted is 147
			await updatePrevotesPrecommits(bftVotes, paramsCache);
			expect(bftVotes.blockBFTInfos.find(b => b.height === 149)?.precommitWeight).toEqual(
				BigInt(65),
			);
			expect(
				bftVotes.activeValidatorsVoteInfo.find(a => a.address.equals(accounts[0]))
					?.largestHeightPrecommit,
			).toBe(149);
		});

		it('should update largestHeightPrecommit for the account which made highest precommit', async () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 151,
					generatorAddress: accounts[0],
				}),
				5,
			);
			// accounts[0] has minPrecommitHeight is largestHeightPrecommit + 1 (149). heightNotPrevoted is 147
			await updatePrevotesPrecommits(bftVotes, paramsCache);
			expect(
				bftVotes.activeValidatorsVoteInfo.find(a => a.address.equals(accounts[0]))
					?.largestHeightPrecommit,
			).toBe(149);
			expect(
				bftVotes.activeValidatorsVoteInfo.find(a => a.address.equals(accounts[1]))
					?.largestHeightPrecommit,
			).toBe(0);
			expect(
				bftVotes.activeValidatorsVoteInfo.find(a => a.address.equals(accounts[2]))
					?.largestHeightPrecommit,
			).toBe(0);
		});

		it('should not increment the prevote where already prevoted', async () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 151,
					generatorAddress: accounts[0],
				}),
				5,
			);
			// accounts[0] has minPrecommitHeight is largestHeightPrecommit + 1 (149). heightNotPrevoted is 147
			await updatePrevotesPrecommits(bftVotes, paramsCache);
			expect(bftVotes.blockBFTInfos.find(b => b.height === 149)?.prevoteWeight).toEqual(BigInt(68));
		});

		it('should not increment the prevote when generator is not active', async () => {
			insertBlockBFTInfo(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					maxHeightGenerated: 0,
					generatorAddress: accounts[2],
				}),
				5,
			);
			// accounts[0] has minPrecommitHeight is largestHeightPrecommit + 1 (149). heightNotPrevoted is 147
			await updatePrevotesPrecommits(bftVotes, paramsCache);
			expect(bftVotes.blockBFTInfos.find(b => b.height === 148)?.prevoteWeight).toEqual(BigInt(68));
		});
	});

	describe('updateMaxHeightPrevoted', () => {
		let paramsCache: BFTParametersCache;

		it('should store maximum height where prevote exceeds threshold', async () => {
			const stateStore = new StateStore(new InMemoryDatabase());
			const paramsStore = stateStore.getStore(MODULE_STORE_PREFIX_BFT, STORE_PREFIX_BFT_PARAMETERS);
			await paramsStore.setWithSchema(
				utils.intToBuffer(101, 4),
				{
					prevoteThreshold: BigInt(68),
					precommitThreshold: BigInt(68),
					certificateThreshold: BigInt(68),
					validators: [
						{
							address: accounts[0],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[1],
							bftWeight: BigInt(0),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[2],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
					],
					validatorsHash: utils.getRandomBytes(32),
				},
				bftParametersSchema,
			);
			paramsCache = new BFTParametersCache(paramsStore);
			await expect(updateMaxHeightPrevoted(bftVotes, paramsCache)).toResolve();
			expect(bftVotes.maxHeightPrevoted).toBe(149);
		});

		it('should not update maxHeightPrevoted if no block info exceeds threshold', async () => {
			const stateStore = new StateStore(new InMemoryDatabase());
			const paramsStore = stateStore.getStore(MODULE_STORE_PREFIX_BFT, STORE_PREFIX_BFT_PARAMETERS);
			await paramsStore.setWithSchema(
				utils.intToBuffer(101, 4),
				{
					prevoteThreshold: BigInt(103),
					precommitThreshold: BigInt(68),
					certificateThreshold: BigInt(68),
					validators: [
						{
							address: accounts[0],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[1],
							bftWeight: BigInt(0),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[2],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
					],
					validatorsHash: utils.getRandomBytes(32),
				},
				bftParametersSchema,
			);
			paramsCache = new BFTParametersCache(paramsStore);
			await expect(updateMaxHeightPrevoted(bftVotes, paramsCache)).toResolve();
			expect(bftVotes.maxHeightPrevoted).toBe(103);
		});
	});

	describe('updateMaxHeightPrecommitted', () => {
		let paramsCache: BFTParametersCache;

		it('should store maximum height where prevote exceeds threshold', async () => {
			const stateStore = new StateStore(new InMemoryDatabase());
			const paramsStore = stateStore.getStore(MODULE_STORE_PREFIX_BFT, STORE_PREFIX_BFT_PARAMETERS);
			await paramsStore.setWithSchema(
				utils.intToBuffer(101, 4),
				{
					prevoteThreshold: BigInt(68),
					precommitThreshold: BigInt(67),
					certificateThreshold: BigInt(68),
					validators: [
						{
							address: accounts[0],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[1],
							bftWeight: BigInt(0),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[2],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
					],
					validatorsHash: utils.getRandomBytes(32),
				},
				bftParametersSchema,
			);
			paramsCache = new BFTParametersCache(paramsStore);
			await expect(updateMaxHeightPrecommitted(bftVotes, paramsCache)).toResolve();
			expect(bftVotes.maxHeightPrecommitted).toBe(148);
		});

		it('should not update maxHeightPrevoted if no block info exceeds threshold', async () => {
			const stateStore = new StateStore(new InMemoryDatabase());
			const paramsStore = stateStore.getStore(MODULE_STORE_PREFIX_BFT, STORE_PREFIX_BFT_PARAMETERS);
			await paramsStore.setWithSchema(
				utils.intToBuffer(101, 4),
				{
					prevoteThreshold: BigInt(68),
					precommitThreshold: BigInt(103),
					certificateThreshold: BigInt(68),
					validators: [
						{
							address: accounts[0],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[1],
							bftWeight: BigInt(0),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
						{
							address: accounts[2],
							bftWeight: BigInt(1),
							blsKey: utils.getRandomBytes(48),
							generatorKey: utils.getRandomBytes(32),
						},
					],
					validatorsHash: utils.getRandomBytes(32),
				},
				bftParametersSchema,
			);
			paramsCache = new BFTParametersCache(paramsStore);
			await expect(updateMaxHeightPrecommitted(bftVotes, paramsCache)).toResolve();
			expect(bftVotes.maxHeightPrecommitted).toBe(56);
		});
	});

	describe('updateMaxHeightCertified', () => {
		it('should update maxHeightCertified when aggregateCommit is not empty', () => {
			updateMaxHeightCertified(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					aggregateCommit: {
						aggregationBits: utils.getRandomBytes(3),
						certificateSignature: utils.getRandomBytes(64),
						height: 10,
					},
				}),
			);

			expect(bftVotes.maxHeightCertified).toBe(10);
		});

		it('should not update maxHeightCertified when aggregateCommit is empty', () => {
			updateMaxHeightCertified(
				bftVotes,
				createFakeBlockHeader({
					height: 152,
					aggregateCommit: {
						aggregationBits: Buffer.alloc(0),
						certificateSignature: Buffer.alloc(0),
						height: 10,
					},
				}),
			);

			expect(bftVotes.maxHeightCertified).toBe(5);
		});
	});
});
