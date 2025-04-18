/* eslint-disable max-classes-per-file */
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

import { InMemoryDatabase } from '@liskhq/lisk-db';
import { codec } from '@liskhq/lisk-codec';
import { LegacyEndpoint } from '../../../../src/engine/legacy/endpoint';
import { blockFixtures } from './fixtures';
import { blockSchemaV2, blockHeaderSchemaV2 } from '../../../../src/engine/legacy/schemas';
import { LegacyBlockJSON } from '../../../../src/engine/legacy/types';

const bufferToHex = (b: Buffer) => Buffer.from(b).toString('hex');

describe('Legacy endpoint', () => {
	let encodedBlock: Buffer;
	let legacyEndpoint: LegacyEndpoint;

	beforeEach(() => {
		legacyEndpoint = new LegacyEndpoint({ db: new InMemoryDatabase() as any });
		encodedBlock = codec.encode(blockSchemaV2, {
			header: codec.encode(blockHeaderSchemaV2, blockFixtures[0].header),
			payload: blockFixtures[0].payload,
		});

		jest.spyOn(legacyEndpoint.storage, 'getBlockByID').mockResolvedValue(encodedBlock);
		jest.spyOn(legacyEndpoint.storage, 'getBlockByHeight').mockResolvedValue(encodedBlock);
	});

	describe('LegacyEndpoint', () => {
		const matchBlockExpectations = (block: LegacyBlockJSON) => {
			expect(block.header.id).toEqual(bufferToHex(blockFixtures[0].header.id));
			expect(block.header.version).toEqual(blockFixtures[0].header.version);
			expect(block.header.timestamp).toEqual(blockFixtures[0].header.timestamp);
			expect(block.header.height).toEqual(blockFixtures[0].header.height);
			expect(block.header.previousBlockID).toEqual(
				bufferToHex(blockFixtures[0].header.previousBlockID),
			);
			expect(block.header.transactionRoot).toEqual(
				bufferToHex(blockFixtures[0].header.transactionRoot),
			);
			expect(block.header.generatorPublicKey).toEqual(
				bufferToHex(blockFixtures[0].header.generatorPublicKey),
			);
			expect(BigInt(block.header.reward as number)).toEqual(blockFixtures[0].header.reward);
			expect(block.header.asset).toEqual(bufferToHex(blockFixtures[0].header.asset));
			expect(block.header.signature).toEqual(bufferToHex(blockFixtures[0].header.signature));

			expect(block.payload).toHaveLength(blockFixtures[0].payload.length);
			expect(block.payload[0]).toEqual(bufferToHex(blockFixtures[0].payload[0]));
		};

		it('getBlockByID', async () => {
			const block = await legacyEndpoint.getBlockByID({
				params: { id: bufferToHex(blockFixtures[0].header.id) },
			} as any);

			matchBlockExpectations(block);
		});

		it('getBlockByHeight', async () => {
			const block = await legacyEndpoint.getBlockByHeight({
				params: { height: blockFixtures[0].header.height },
			} as any);

			matchBlockExpectations(block);
		});
	});
});
