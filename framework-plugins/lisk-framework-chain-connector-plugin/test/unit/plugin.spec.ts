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

import {
	Certificate,
	cryptography,
	chain,
	testing,
	apiClient,
	ApplicationConfigForPlugin,
	GenesisConfig,
	LIVENESS_LIMIT,
	ChainAccount,
	ChainStatus,
	codec,
	CCMsg,
	ccmSchema,
	db,
	Block,
} from 'lisk-sdk';
import { when } from 'jest-when';
import {
	CCU_FREQUENCY,
	CROSS_CHAIN_COMMAND_NAME_TRANSFER,
	MODULE_NAME_INTEROPERABILITY,
	CCM_SEND_SUCCESS,
	CCU_TOTAL_CCM_SIZE,
} from '../../src/constants';
import * as plugins from '../../src/chain_connector_plugin';
import * as dbApi from '../../src/db';
import { BlockHeader, CrossChainMessagesFromEvents } from '../../src/types';
import * as certificateGeneration from '../../src/certificate_generation';
import * as activeValidatorsUpdateUtil from '../../src/active_validators_update';

const appConfigForPlugin: ApplicationConfigForPlugin = {
	system: {
		keepEventsForHeights: -1,
		dataPath: '~/.lisk',
		logLevel: 'info',
		version: '1.0.0',
	},
	rpc: {
		modes: ['ipc'],
		port: 8080,
		host: '127.0.0.1',
	},
	network: {
		seedPeers: [],
		port: 5000,
		version: '1.0.0',
	},
	transactionPool: {
		maxTransactions: 4096,
		maxTransactionsPerAccount: 64,
		transactionExpiryTime: 3 * 60 * 60 * 1000,
		minEntranceFeePriority: '0',
		minReplacementFeeDifference: '10',
	},
	genesis: {} as GenesisConfig,
	generator: {
		keys: {
			fromFile: '',
		},
	},
	modules: {},
	legacy: {
		brackets: [],
		sync: false,
	},
};

const getTestBlock = async () => {
	return testing.createBlock({
		chainID: Buffer.from('00001111', 'hex'),
		privateKey: Buffer.from(
			'd4b1a8a6f91482c40ba1d5c054bd7595cc0230291244fc47869f51c21af657b9e142de105ecd851507f2627e991b54b2b71104b11b6660d0646b9fdbe415fd87',
			'hex',
		),
		previousBlockID: cryptography.utils.getRandomBytes(20),
		timestamp: Math.floor(Date.now() / 1000),
	});
};

const getCCM = (n = 1): CCMsg => {
	return {
		nonce: BigInt(n),
		module: MODULE_NAME_INTEROPERABILITY,
		crossChainCommand: CROSS_CHAIN_COMMAND_NAME_TRANSFER,
		sendingChainID: Buffer.from([0, 0, 0, 3]),
		receivingChainID: Buffer.from([0, 0, 0, 2]),
		fee: BigInt(n),
		status: 0,
		params: Buffer.alloc(1000),
	};
};

const getEventsJSON = (eventsCount: number, height = 1) => {
	const someEvents = [];
	let i = 0;
	while (i < eventsCount) {
		someEvents.push(
			new chain.Event({
				index: i,
				module: MODULE_NAME_INTEROPERABILITY,
				topics: [cryptography.utils.getRandomBytes(32)],
				name: CCM_SEND_SUCCESS,
				height,
				data: codec.encode(ccmSchema, { ...getCCM(height + i) } as CCMsg),
			}),
		);
		i += 1;
	}
	return someEvents.map(e => e.toJSON());
};

const apiClientMocks = {
	disconnect: jest.fn().mockResolvedValue({} as never),
	invoke: jest.fn(),
	subscribe: jest.fn().mockResolvedValue({} as never),
	connect: jest.fn().mockResolvedValue({} as never),
};
const ownChainID = Buffer.from('10000000', 'hex');

const initChainConnectorPlugin = async (
	chainConnectorPlugin: plugins.ChainConnectorPlugin,
	ccuFrequency = CCU_FREQUENCY,
) => {
	await chainConnectorPlugin.init({
		logger: testing.mocks.loggerMock,
		config: {
			mainchainIPCPath: '~/.lisk/mainchain',
			sidechainIPCPath: '~/.list/sidechain',
			ccuFrequency,
		},
		appConfig: appConfigForPlugin,
	});
};

describe('ChainConnectorPlugin', () => {
	let chainConnectorPlugin: plugins.ChainConnectorPlugin;
	const sidechainAPIClientMock = {
		disconnect: jest.fn().mockResolvedValue({} as never),
		invoke: jest.fn(),
		subscribe: jest.fn(),
	};

	const chainConnectorStoreMock = {
		setBlockHeaders: jest.fn(),
		getBlockHeaders: jest.fn(),
		setAggregateCommits: jest.fn(),
		getAggregateCommits: jest.fn(),
		setCrossChainMessages: jest.fn(),
		getCrossChainMessages: jest.fn(),
		getValidatorsHashPreimage: jest.fn(),
		setValidatorsHashPreimage: jest.fn(),
		close: jest.fn(),
	};
	beforeEach(() => {
		chainConnectorPlugin = new plugins.ChainConnectorPlugin();

		jest.spyOn(dbApi, 'getDBInstance').mockResolvedValue(new db.InMemoryDatabase() as never);
		(chainConnectorPlugin as any)['_sidechainChainConnectorStore'] = chainConnectorStoreMock;
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	describe('init', () => {
		beforeEach(() => {
			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(sidechainAPIClientMock as never);
		});

		it('should assign ccuFrequency properties to default values', async () => {
			await initChainConnectorPlugin(chainConnectorPlugin);
			expect(chainConnectorPlugin['_ccuFrequency']).toEqual(CCU_FREQUENCY);
		});

		it('should assign ccuFrequency properties to passed config values', async () => {
			await initChainConnectorPlugin(chainConnectorPlugin, 300000);
			expect(chainConnectorPlugin['_ccuFrequency']).toBe(300000);
		});
	});

	describe('load', () => {
		beforeEach(() => {
			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(apiClientMocks as never);
			(chainConnectorPlugin as any)['_mainchainAPIClient'] = apiClientMocks;
			(chainConnectorPlugin as any)['_sidechainAPIClient'] = apiClientMocks;
			when(apiClientMocks.invoke)
				.calledWith('interoperability_getOwnChainAccount')
				.mockResolvedValue({
					chainID: ownChainID.toString('hex'),
				});
			when(apiClientMocks.invoke)
				.calledWith('interoperability_getChainAccount', { chainID: ownChainID })
				.mockResolvedValue({
					height: 10,
					stateRoot: cryptography.utils.getRandomBytes(32).toString('hex'),
					timestamp: Date.now(),
					validatorsHash: cryptography.utils.getRandomBytes(32).toString('hex'),
				});
		});

		afterEach(async () => {
			await chainConnectorPlugin.unload();
		});

		it('should initialize api clients without sidechain', async () => {
			await initChainConnectorPlugin(chainConnectorPlugin);
			await chainConnectorPlugin.load();

			expect(chainConnectorPlugin['_mainchainAPIClient']).toBeDefined();
			expect(chainConnectorPlugin['_sidechainAPIClient']).toBe(chainConnectorPlugin['_apiClient']);
		});

		it('should initialize api clients with sidechain', async () => {
			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(apiClientMocks as never);
			await chainConnectorPlugin.init({
				logger: testing.mocks.loggerMock,
				config: { mainchainIPCPath: '~/.lisk/mainchain', sidechainIPCPath: '~/.lisk/sidechain' },
				appConfig: appConfigForPlugin,
			});
			await chainConnectorPlugin.load();

			expect(chainConnectorPlugin['_mainchainAPIClient']).toBeDefined();
			expect(chainConnectorPlugin['_sidechainAPIClient']).toBeDefined();
		});

		it('should initialize _chainConnectorDB', async () => {
			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(apiClientMocks as never);
			await chainConnectorPlugin.init({
				logger: testing.mocks.loggerMock,
				config: {
					mainchainIPCPath: '~/.lisk/mainchain',
					sidechainIPCPath: '~/.lisk/sidechain',
				},
				appConfig: appConfigForPlugin,
			});

			await chainConnectorPlugin.load();

			expect(dbApi.getDBInstance).toHaveBeenCalledTimes(1);
			expect(chainConnectorPlugin['_chainConnectorPluginDB']).toEqual(
				new db.InMemoryDatabase() as never,
			);
		});
	});

	describe('_newBlockHandler', () => {
		let block: Block;

		beforeEach(async () => {
			block = await getTestBlock();

			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(sidechainAPIClientMock as never);

			(chainConnectorPlugin as any)['_sidechainChainConnectorStore'] = chainConnectorStoreMock;
			(chainConnectorPlugin as any)['_sidechainAPIClient'] = sidechainAPIClientMock;
			when(sidechainAPIClientMock.invoke)
				.calledWith('interoperability_getOwnChainAccount')
				.mockResolvedValue({
					chainID: ownChainID.toString('hex'),
				});
			(chainConnectorPlugin as any)['_groupCCMsBySize'] = jest.fn();
			when(sidechainAPIClientMock.invoke)
				.calledWith('interoperability_getChainAccount', { chainID: ownChainID })
				.mockResolvedValue({
					height: 10,
					stateRoot: cryptography.utils.getRandomBytes(32).toString('hex'),
					timestamp: Date.now(),
					validatorsHash: cryptography.utils.getRandomBytes(32).toString('hex'),
				});
			(chainConnectorPlugin as any)['_createCCU'] = jest.fn();
			(chainConnectorPlugin as any)['_cleanup'] = jest.fn();

			when(sidechainAPIClientMock.invoke)
				.calledWith('consensus_getBFTParameters', { height: block.header.height })
				.mockResolvedValue({
					certificateThreshold: BigInt(70),
					validators: [],
					validatorsHash: cryptography.utils.getRandomBytes(20),
				});
		});

		afterEach(async () => {
			(chainConnectorPlugin as any)['_mainchainAPIClient'] = apiClientMocks;
			(chainConnectorPlugin as any)['_sidechainAPIClient'] = apiClientMocks;
			await chainConnectorPlugin.unload();
			jest.resetAllMocks();
		});

		it('should invoke "consensus_getBFTParameters" on _sidechainAPIClient', async () => {
			when(chainConnectorStoreMock.getBlockHeaders).calledWith().mockResolvedValue([]);

			when(chainConnectorStoreMock.getAggregateCommits).calledWith().mockResolvedValue([]);

			when(chainConnectorStoreMock.getValidatorsHashPreimage).calledWith().mockResolvedValue([]);

			when(chainConnectorStoreMock.getCrossChainMessages).calledWith().mockResolvedValue([]);

			jest.spyOn(chainConnectorPlugin, '_calculateCCUParams').mockResolvedValue();
			await initChainConnectorPlugin(chainConnectorPlugin);
			await chainConnectorPlugin.load();

			await (chainConnectorPlugin as any)['_newBlockHandler']({
				blockHeader: block.header.toJSON(),
			});

			expect(sidechainAPIClientMock.subscribe).toHaveBeenCalledTimes(1);
			expect(sidechainAPIClientMock.invoke).toHaveBeenCalledWith('consensus_getBFTParameters', {
				height: block.header.height,
			});
			expect((chainConnectorPlugin as any)['_cleanup']).toHaveBeenCalled();
		});

		// eslint-disable-next-line jest/no-disabled-tests
		it.skip('should invoke "chain_getEvents" on _sidechainAPIClient', async () => {
			const testBlock = await getTestBlock();
			const eventsJson = getEventsJSON(2);

			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(sidechainAPIClientMock as never);

			when(sidechainAPIClientMock.invoke)
				.calledWith('chain_getEvents', { height: testBlock.header.height })
				.mockResolvedValue(eventsJson);

			when(sidechainAPIClientMock.invoke)
				.calledWith('system_getMetadata')
				.mockResolvedValue({
					modules: [
						{
							name: MODULE_NAME_INTEROPERABILITY,
							stores: [
								{
									key: '03ed0d25f0ba',
									data: {
										$id: '/modules/interoperability/outbox',
									},
								},
							],
						},
					],
				});

			const sampleProof = {
				proof: {
					siblingHashes: [Buffer.alloc(0)],
					queries: [
						{
							key: Buffer.alloc(0),
							value: Buffer.alloc(0),
							bitmap: Buffer.alloc(0),
						},
					],
				},
			};
			when(sidechainAPIClientMock.invoke)
				.calledWith('state_prove', {
					queries: [
						Buffer.concat([Buffer.from('03ed0d25f0ba', 'hex'), Buffer.from('10000000', 'hex')]),
					],
				})
				.mockResolvedValue(sampleProof);

			when(sidechainAPIClientMock.invoke)
				.calledWith('interoperability_ownChainAccount')
				.mockResolvedValue({
					chainID: '10000000',
				});

			await initChainConnectorPlugin(chainConnectorPlugin);
			await chainConnectorPlugin.load();

			await (chainConnectorPlugin as any)['_newBlockHandler']({
				blockHeader: testBlock.header.toJSON(),
			});

			expect(sidechainAPIClientMock.subscribe).toHaveBeenCalledTimes(1);
			expect(sidechainAPIClientMock.invoke).toHaveBeenCalledWith('chain_getEvents', {
				height: testBlock.header.height,
			});

			// expect((chainConnectorPlugin as any)['_createCCU']).toHaveBeenCalled();
			// expect((chainConnectorPlugin as any)['_cleanup']).toHaveBeenCalled();

			// const ccm = getCCM(1);
			const savedCCMs = await chainConnectorPlugin[
				'_sidechainChainConnectorStore'
			].getCrossChainMessages();

			expect(savedCCMs).toEqual([
				{
					ccms: [
						{ ...getCCM(1), nonce: BigInt(1) },
						{ ...getCCM(2), nonce: BigInt(2) },
					],
					height: 1,
					inclusionProof: {
						bitmap: sampleProof.proof.queries[0].bitmap,
						siblingHashes: sampleProof.proof.siblingHashes,
					},
				},
			]);
		});
	});

	describe('_groupCCMsBySize', () => {
		it('should return CrossChainMessagesFromEvents[][] with length of total CCMs divided by CCU_TOTAL_CCM_SIZE', () => {
			const ccmsFromEvents: CrossChainMessagesFromEvents[] = [];
			const buildNumCCMs = (num: number, fromHeight: number): CCMsg[] => {
				const ccms: CCMsg[] = [];
				let j = 1;
				while (j <= num) {
					ccms.push(getCCM(fromHeight + j));
					j += 1;
				}
				return ccms;
			};

			ccmsFromEvents.push({
				height: 1,
				ccms: buildNumCCMs(2, 1),
				inclusionProof: {} as any,
			});
			ccmsFromEvents.push({
				height: 3,
				ccms: buildNumCCMs(5, 3),
				inclusionProof: {} as any,
			});
			ccmsFromEvents.push({
				height: 4,
				ccms: buildNumCCMs(20, 4),
				inclusionProof: {} as any,
			});

			// after filtering, we will have ccms only from heights 3 & 4, so total 25 (20 + 5)
			chainConnectorPlugin['_lastCertificate'] = {
				height: 2,
				stateRoot: Buffer.alloc(1),
				timestamp: Date.now(),
				validatorsHash: Buffer.alloc(1),
			};
			const listOfCCMs = (chainConnectorPlugin as any)['_groupCCMsBySize'](ccmsFromEvents, {
				height: 5,
			} as Certificate);

			const getTotalSize = (ccms: CCMsg[]) => {
				return ccms
					.map(ccm => codec.encode(ccmSchema, ccm).length) // to each CCM size
					.reduce((a, b) => a + b, 0); // sum
			};

			// for 25 CCMs (after filtering), we will have 3 lists
			expect(listOfCCMs).toHaveLength(3);

			// Ist list will have 9 CCMs (start index 0, last index = 8), totalSize = 9531 (1059 * 9))
			const firstList = listOfCCMs[0];
			expect(firstList).toHaveLength(9);
			expect(getTotalSize(firstList)).toBeLessThan(CCU_TOTAL_CCM_SIZE);

			// 2nd list will have 9 CCMs (start index 9, last index = 17)
			const secondList = listOfCCMs[1];
			expect(secondList).toHaveLength(9);
			expect(getTotalSize(secondList)).toBeLessThan(CCU_TOTAL_CCM_SIZE);

			// 3rd list will have 7 CCMs (start index 18)
			const thirdList = listOfCCMs[2];
			expect(thirdList).toHaveLength(9);
		});
	});

	describe('unload', () => {
		it.todo('should unload plugin');
	});

	describe('Cleanup Functions', () => {
		let block1: BlockHeader;
		let block2: BlockHeader;

		beforeEach(async () => {
			jest.spyOn(apiClient, 'createIPCClient').mockResolvedValue(sidechainAPIClientMock as never);
			await chainConnectorPlugin.init({
				logger: testing.mocks.loggerMock,
				config: {
					mainchainIPCPath: '~/.lisk/mainchain',
					sidechainIPCPath: '~/.list/sidechain',
				},
				appConfig: appConfigForPlugin,
			});

			when(sidechainAPIClientMock.invoke)
				.calledWith('interoperability_getOwnChainAccount')
				.mockResolvedValue({
					chainID: ownChainID.toString('hex'),
				});
			when(sidechainAPIClientMock.invoke)
				.calledWith('interoperability_getChainAccount', { chainID: ownChainID })
				.mockResolvedValue({
					height: 10,
					stateRoot: cryptography.utils.getRandomBytes(32).toString('hex'),
					timestamp: Date.now(),
					validatorsHash: cryptography.utils.getRandomBytes(32).toString('hex'),
				});

			await chainConnectorPlugin.load();
			(chainConnectorPlugin as any)['_sidechainChainConnectorStore'] = chainConnectorStoreMock;

			chainConnectorPlugin['_lastCertificate'] = {
				height: 6,
				stateRoot: cryptography.utils.getRandomBytes(32),
				timestamp: Date.now(),
				validatorsHash: cryptography.utils.getRandomBytes(32),
			};
			chainConnectorStoreMock.getCrossChainMessages.mockResolvedValue([
				getCCM(1),
				getCCM(2),
			] as never);
			jest
				.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getAggregateCommits')
				.mockResolvedValue([
					{
						height: 5,
					},
				] as never);
			jest
				.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getValidatorsHashPreimage')
				.mockResolvedValue([
					{
						certificateThreshold: 5,
					},
				] as never);
			block1 = testing.createFakeBlockHeader({ height: 5 }).toObject();
			block2 = testing.createFakeBlockHeader({ height: 6 }).toObject();
			chainConnectorStoreMock.getBlockHeaders.mockResolvedValue([block1, block2] as never);
		});

		it('should delete block headers with height less than _lastCertifiedHeight', async () => {
			await chainConnectorPlugin['_cleanup']();

			expect(chainConnectorStoreMock.getBlockHeaders).toHaveBeenCalledTimes(1);

			expect(chainConnectorStoreMock.setBlockHeaders).toHaveBeenCalledWith([block2]);
		});

		it('should delete aggregate commits with height less than _lastCertifiedHeight', async () => {
			await chainConnectorPlugin['_cleanup']();

			expect(
				chainConnectorPlugin['_sidechainChainConnectorStore'].getAggregateCommits,
			).toHaveBeenCalledTimes(1);

			expect(
				chainConnectorPlugin['_sidechainChainConnectorStore'].setAggregateCommits,
			).toHaveBeenCalledWith([]);
		});

		it('should delete validatorsHashPreimage with certificate threshold less than _lastCertifiedHeight', async () => {
			await chainConnectorPlugin['_cleanup']();

			expect(
				chainConnectorPlugin['_sidechainChainConnectorStore'].getValidatorsHashPreimage,
			).toHaveBeenCalledTimes(1);

			expect(
				chainConnectorPlugin['_sidechainChainConnectorStore'].setValidatorsHashPreimage,
			).toHaveBeenCalledWith([]);
		});
	});

	describe('_verifyLiveness', () => {
		beforeEach(() => {
			(chainConnectorPlugin as any)['_mainchainAPIClient'] = apiClientMocks;
			(chainConnectorPlugin as any)['_sidechainAPIClient'] = apiClientMocks;
		});

		it('should not validate if provided chain ID is not live', async () => {
			(chainConnectorPlugin['_mainchainAPIClient'] as any).invoke = jest
				.fn()
				.mockResolvedValue(false);

			const result = await chainConnectorPlugin['_verifyLiveness'](Buffer.from('10'), 10, 5);

			expect(result.status).toBe(false);
		});

		it('should not validate if the condition blockTimestamp - certificateTimestamp < LIVENESS_LIMIT / 2, is invalid', async () => {
			(chainConnectorPlugin['_mainchainAPIClient'] as any).invoke = jest
				.fn()
				.mockResolvedValue(true);

			const blockTimestamp = LIVENESS_LIMIT;
			const certificateTimestamp = LIVENESS_LIMIT / 2;

			const result = await chainConnectorPlugin['_verifyLiveness'](
				Buffer.from('10'),
				certificateTimestamp,
				blockTimestamp,
			);

			expect(result.status).toBe(false);
		});

		it('should validate if provided chain ID is live and blockTimestamp - certificateTimestamp < LIVENESS_LIMIT / 2', async () => {
			(chainConnectorPlugin['_mainchainAPIClient'] as any).invoke = jest
				.fn()
				.mockResolvedValue(true);

			const result = await chainConnectorPlugin['_verifyLiveness'](Buffer.from('10'), 10, 5);

			expect(result.status).toBe(true);
		});
	});

	describe('_validateCertificate', () => {
		it('should not validate if chain is terminated', async () => {
			const certificateBytes = Buffer.from('10');
			const certificate = { height: 5 } as Certificate;
			const blockHeader = {} as BlockHeader;
			const chainAccount = { status: ChainStatus.TERMINATED } as ChainAccount;
			const sendingChainID = Buffer.from('01');

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccount,
				sendingChainID,
			);

			expect(result.status).toBe(false);
		});

		it('should not validate if certificate height is not greater than height of last certificate', async () => {
			const certificateBytes = Buffer.from('10');
			const certificate = { height: 5 } as Certificate;
			const blockHeader = {} as BlockHeader;
			const chainAccout = {
				status: ChainStatus.ACTIVE,
				lastCertificate: { height: 5 },
			} as ChainAccount;
			const sendingChainID = Buffer.from('01');

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccout,
				sendingChainID,
			);

			expect(result.status).toBe(false);
		});

		it('should not validate if liveness is not valid', async () => {
			chainConnectorPlugin['_verifyLiveness'] = jest.fn().mockResolvedValue({
				status: false,
			});

			const certificateBytes = Buffer.from('10');
			const certificate = { height: 5 } as Certificate;
			const blockHeader = {} as BlockHeader;
			const chainAccount = {
				status: ChainStatus.ACTIVE,
				lastCertificate: { height: 4 },
			} as ChainAccount;
			const sendingChainID = Buffer.from('01');

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccount,
				sendingChainID,
			);

			expect(result.status).toBe(false);
		});

		it('should validate if chain is active and has valid liveness', async () => {
			chainConnectorPlugin['_verifyLiveness'] = jest.fn().mockResolvedValue({
				status: true,
			});

			const certificateBytes = Buffer.from('10');
			const certificate = { height: 5 } as Certificate;
			const blockHeader = {} as BlockHeader;
			const chainAccount = {
				status: ChainStatus.ACTIVE,
				lastCertificate: { height: 4 },
			} as ChainAccount;
			const sendingChainID = Buffer.from('01');

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccount,
				sendingChainID,
			);

			expect(result.status).toBe(true);
		});

		it('should not validate if weighted aggregate signature validation fails', async () => {
			chainConnectorPlugin['_verifyLiveness'] = jest.fn().mockResolvedValue({
				status: true,
			});

			jest
				.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getValidatorsHashPreimage')
				.mockResolvedValue([
					{
						validatorsHash: Buffer.from('10'),
						validators: [
							{
								blsKey: Buffer.from('10'),
								bftWeight: BigInt(10),
							},
						],
					},
				] as never);

			jest.spyOn(cryptography.bls, 'verifyWeightedAggSig').mockReturnValue(false);

			const certificateBytes = Buffer.from('10');
			const certificate = {
				height: 5,
				aggregationBits: Buffer.from('10'),
				signature: Buffer.from('10'),
			} as Certificate;
			const blockHeader = { validatorsHash: Buffer.from('10') } as BlockHeader;
			const sendingChainID = Buffer.from('01');

			const chainAccount = {
				status: 0,
				name: 'chain1',
				lastCertificate: { height: 4 },
			} as ChainAccount;

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccount,
				sendingChainID,
			);

			expect(result.status).toBe(false);
		});

		it('should not validate if ValidatorsData for block header is undefined', async () => {
			chainConnectorPlugin['_verifyLiveness'] = jest.fn().mockResolvedValue({
				status: true,
			});
			jest
				.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getValidatorsHashPreimage')
				.mockResolvedValue([
					{
						validatorsHash: Buffer.from('10'),
						validators: [
							{
								blsKey: Buffer.from('10'),
								bftWeight: BigInt(10),
							},
						],
					},
				] as never);

			jest.spyOn(cryptography.bls, 'verifyWeightedAggSig').mockReturnValue(false);

			const certificateBytes = Buffer.from('10');
			const certificate = {
				height: 5,
				aggregationBits: Buffer.from('10'),
				signature: Buffer.from('10'),
			} as Certificate;
			const blockHeader = { validatorsHash: Buffer.from('11') } as BlockHeader;
			const chainAccount = {
				status: 0,
				name: 'chain1',
				lastCertificate: { height: 4 },
			} as ChainAccount;
			const sendingChainID = Buffer.from('01');

			const result = await chainConnectorPlugin['validateCertificate'](
				certificateBytes,
				certificate,
				blockHeader,
				chainAccount,
				sendingChainID,
			);

			expect(result.status).toBe(false);
		});
	});

	describe('_calculateInboxUpdate', () => {
		// const sendingChainID = Buffer.from('00000001', 'hex');
		const certificate: Certificate = {
			blockID: Buffer.alloc(1),
			height: 2,
			stateRoot: Buffer.alloc(1),
			timestamp: Date.now(),
			validatorsHash: Buffer.alloc(1),
		};

		const ccms = [getCCM(0), getCCM(1)];
		const ccmHashes = ccms.map(ccm => codec.encode(ccmSchema, ccm));
		const expectedInboxUpdate = [
			{
				crossChainMessages: ccmHashes,
				messageWitnessHashes: [],
				outboxRootWitness: {
					bitmap: Buffer.alloc(1),
					siblingHashes: [Buffer.alloc(0)],
				},
			},
		];

		beforeEach(() => {
			chainConnectorStoreMock.getCrossChainMessages.mockResolvedValue([
				{
					ccms: [getCCM(0), getCCM(1)],
					height: 1,
					inclusionProof: {
						bitmap: Buffer.alloc(0),
						siblingHashes: [Buffer.alloc(0)],
					},
				},
				{
					ccms: [getCCM(0), getCCM(1)],
					height: 2,
					inclusionProof: {
						bitmap: Buffer.alloc(1),
						siblingHashes: [Buffer.alloc(0)],
					},
				},
			] as CrossChainMessagesFromEvents[]);

			chainConnectorPlugin['_sidechainAPIClient'] = sidechainAPIClientMock as never;
			chainConnectorPlugin['_lastCertificate'] = { ...certificate, height: 1 };
		});

		it('should return InboxUpdate with messageWitnessHashes set to empty array', async () => {
			const inboxUpdate = await chainConnectorPlugin['_calculateInboxUpdate'](certificate);

			expect(inboxUpdate).toEqual(expectedInboxUpdate);
		});
	});

	describe('_calculateCCUParams', () => {
		const validatorsHash = Buffer.from('01');
		// const sendingChainID = Buffer.from('01');
		const certificate: Certificate = {
			height: 5,
			validatorsHash,
			stateRoot: Buffer.from('00'),
			blockID: Buffer.from('00'),
			timestamp: Date.now(),
		};
		const certificateBytes = Buffer.from('ff');
		// const newCertificateThreshold = BigInt(7);
		const chainAccount = {
			lastCertificate: {
				validatorsHash,
			},
		};
		const certificateValidationPassingResult = { status: true };
		const certificateValidationFailingResult = { status: false };
		// const filteredBlockHeader = {
		// 	height: 5,
		// 	validatorsHash,
		// };

		beforeEach(() => {
			(chainConnectorPlugin as any)['_sidechainChainConnectorStore'] = chainConnectorStoreMock;
			chainConnectorStoreMock.getBlockHeaders.mockResolvedValue([
				{
					height: 5,
					validatorsHash,
				},
				{
					height: 6,
					validatorsHash,
				},
			] as never);

			chainConnectorStoreMock.getValidatorsHashPreimage.mockResolvedValue([
				{
					validatorsHash,
					certificateThreshold: BigInt(0),
					validators: [
						{
							bftWeight: BigInt(1),
							blsKey: Buffer.alloc(2),
						},
						{
							bftWeight: BigInt(2),
							blsKey: Buffer.alloc(1),
						},
					],
				},
			] as never);

			jest
				.spyOn(certificateGeneration, 'getNextCertificateFromAggregateCommits')
				.mockReturnValue(certificate as never);
			chainConnectorPlugin['_mainchainAPIClient'] = sidechainAPIClientMock as never;
			chainConnectorPlugin['_sidechainAPIClient'] = sidechainAPIClientMock as never;
			chainConnectorPlugin['_mainchainAPIClient'].invoke = jest
				.fn()
				.mockResolvedValue(chainAccount);
			chainConnectorPlugin['validateCertificate'] = jest
				.fn()
				.mockResolvedValue(certificateValidationFailingResult);
			chainConnectorPlugin['logger'] = {
				error: jest.fn(),
			} as never;

			jest.spyOn(codec, 'encode').mockReturnValue(certificateBytes);
			jest.spyOn(activeValidatorsUpdateUtil, 'getActiveValidatorsDiff').mockReturnValue([]);
			chainConnectorPlugin['_calculateInboxUpdate'] = jest.fn().mockResolvedValue([
				{
					crossChainMessages: [Buffer.alloc(0)],
					messageWitnessHashes: [Buffer.alloc(0)],
					outboxRootWitness: {
						bitmap: Buffer.alloc(0),
						siblingHashes: [Buffer.alloc(0)],
					},
				},
			]);
			chainConnectorPlugin['_lastCertificate'] = certificate;
		});

		it('should call interoperability_getChainAccount on _mainchainAPIClient', async () => {
			await chainConnectorPlugin['_calculateCCUParams']();

			expect(chainConnectorPlugin['_mainchainAPIClient'].invoke).toHaveBeenCalledTimes(1);
			expect(chainConnectorPlugin['_mainchainAPIClient'].invoke).toHaveBeenCalledWith(
				'consensus_getBFTHeights',
			);
		});

		it('should return undefined if certificate validation fails', async () => {
			const ccuTxParams = await chainConnectorPlugin['_calculateCCUParams']();

			expect(ccuTxParams).toBeUndefined();
		});

		it('should call _calculateInboxUpdate', async () => {
			chainConnectorPlugin['validateCertificate'] = jest
				.fn()
				.mockResolvedValue(certificateValidationPassingResult);

			await chainConnectorPlugin['_calculateCCUParams']();

			expect(chainConnectorPlugin['_calculateInboxUpdate']).toHaveBeenCalledTimes(1);
			expect(chainConnectorPlugin['_calculateInboxUpdate']).toHaveBeenCalled();
		});

		describe('when chainAccount.lastCertificate.validatorsHash == certificate.validatorsHash', () => {
			beforeEach(() => {
				chainConnectorPlugin['validateCertificate'] = jest
					.fn()
					.mockResolvedValue(certificateValidationPassingResult);
			});

			it('should return CCUTxParams with activeValidatorsUpdate set to []', async () => {
				await expect(chainConnectorPlugin['_calculateCCUParams']()).resolves.toBeUndefined();
			});
		});

		// describe('when chainAccount.lastCertificate.validatorsHash != certificate.validatorsHash', () => {
		// 	beforeEach(() => {
		// 		(certificate as any).validatorsHash = Buffer.from('20');
		// 		chainConnectorPlugin['validateCertificate'] = jest
		// 			.fn()
		// 			.mockResolvedValue(certificateValidationPassingResult);
		// 	});

		// 	it('should return CCUTxParams with newCertificateThreshold set to provided newCertificateThreshold if validatorsHash of block header at certificate height is not equal to that of last certificate', async () => {
		// 		jest
		// 			.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getBlockHeaders')
		// 			.mockResolvedValue([
		// 				{
		// 					height: 5,
		// 					validatorsHash: Buffer.from('05'),
		// 				},
		// 				{
		// 					height: 6,
		// 					validatorsHash,
		// 				},
		// 			] as never);

		// 		jest
		// 			.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getValidatorsHashPreimage')
		// 			.mockResolvedValue([
		// 				{
		// 					validatorsHash: Buffer.from('05'),
		// 					certificateThreshold: 5,
		// 					validators: [1, 2],
		// 				},
		// 				{
		// 					validatorsHash,
		// 					newCertificateThreshold: 6,
		// 					validators: [2, 3],
		// 				},
		// 			] as never);

		// 		// const ccuTxParams = await chainConnectorPlugin['_calculateCCUParams']();

		// 	});

		// 	it('should call getActiveValidatorsDiff', async () => {
		// 		jest
		// 			.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getBlockHeaders')
		// 			.mockResolvedValue([
		// 				{
		// 					height: 5,
		// 					validatorsHash: Buffer.from('05'),
		// 				},
		// 				{
		// 					height: 6,
		// 					validatorsHash,
		// 				},
		// 			] as never);

		// 		jest
		// 			.spyOn(chainConnectorPlugin['_sidechainChainConnectorStore'], 'getValidatorsHashPreimage')
		// 			.mockResolvedValue([
		// 				{
		// 					validatorsHash: Buffer.from('05'),
		// 					certificateThreshold: 5,
		// 					validators: [1, 2],
		// 				},
		// 				{
		// 					validatorsHash,
		// 					newCertificateThreshold: 6,
		// 					validators: [2, 3],
		// 				},
		// 			] as never);

		// 			await chainConnectorPlugin['_calculateCCUParams']();

		// 		expect(utils.getActiveValidatorsDiff).toHaveBeenCalledTimes(1);
		// 		expect(utils.getActiveValidatorsDiff).toHaveBeenCalledWith([2, 3], [1, 2]);
		// 	});
		// });
	});
});
