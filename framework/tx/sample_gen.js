// eslint-disable

const fs = require('fs');
const path = require('path');
const { utils, address, ed } = require('@liskhq/lisk-cryptography');
const { Mnemonic } = require('@liskhq/lisk-passphrase');

const privateKey =
	'fde63a2a291675ed4fe88b79f30bc76f1b9352217ca6936200029c7ad29595d0bfbef2a36e17ca75b66fd56adea8dd04ed234cd4188aca42fc8a7299d8eaadd8';
const publicKey = ed.getPublicKeyFromPrivateKey(Buffer.from(privateKey, 'hex')).toString('hex');

const randomNumber = max => Math.floor(Math.random() * max);
const randomUInt32 = () => utils.getRandomBytes(4).readUInt32BE(0);
const randomInt64 = () => utils.getRandomBytes(8).readBigInt64BE();
const randomUInt64 = () => utils.getRandomBytes(8).readBigUInt64BE();
const randomWord = () =>
	Mnemonic.wordlists.english[randomUInt32() % Mnemonic.wordlists.english.length];
const randomData = () => {
	let size = 0;
	let words = randomWord();
	while (size < 64) {
		const nextRandom = randomWord();
		if (words.length + nextRandom.length + 1 > 64) {
			return words;
		}

		words += ' ' + nextRandom;
	}
	return words;
};
const randomAddress = () => address.getLisk32AddressFromAddress(utils.getRandomBytes(20));

const tokenTransferKeys = {
	summaryKeys: [
		'module',
		'command',
		'fee',
		'params.tokenID',
		'params.amount',
		'params.accountInitializationFee',
		'params.recipientAddress',
	],
	detailKeys: [
		'module',
		'command',
		'fee',
		'nonce',
		'params.tokenID',
		'params.amount',
		'params.recipientAddress',
		'params.accountInitializationFee',
		'params.data',
	],
};

const createTokenTransfer = () => ({
	unsignedTransaction: {
		module: 'token',
		command: 'transfer',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			tokenID: utils.getRandomBytes(8).toString('hex'),
			amount: randomUInt64().toString(),
			recipientAddress: randomAddress(),
			accountInitializationFee: randomUInt64().toString(),
			data: randomData(),
		},
		signatures: [],
	},
	...tokenTransferKeys,
});

const crossChainTransferKeys = {
	summaryKeys: [
		'module',
		'command',
		'fee',
		'params.tokenID',
		'params.amount',
		'params.recipientAddress',
		'params.escrowInitializationFee',
		'params.receivingChainID',
	],
	detailKeys: [
		'module',
		'command',
		'fee',
		'params.tokenID',
		'params.amount',
		'params.recipientAddress',
		'params.receivingChainID',
		'params.messageFee',
		'params.escrowInitializationFee',
		'params.data',
	],
};

const createCrossChainTokenTransfer = () => ({
	unsignedTransaction: {
		module: 'token',
		command: 'crossChainTransfer',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			tokenID: utils.getRandomBytes(8).toString('hex'),
			amount: randomUInt64().toString(),
			receivingChainID: utils.getRandomBytes(4).toString('hex'),
			recipientAddress: randomAddress(),
			messageFee: randomUInt64().toString(),
			escrowInitializationFee: randomUInt64().toString(),
			data: randomData(),
		},
		signatures: [],
	},
	...crossChainTransferKeys,
});

const registerMultisignatureGroupKeys = {
	summaryKeys: [
		'module',
		'command',
		'fee',
		'params.numberOfSignatures',
		'params.mandatoryKeys',
		'params.optionalKeys',
	],
	detailKeys: [
		'module',
		'command',
		'fee',
		'params.numberOfSignatures',
		'params.mandatoryKeys',
		'params.optionalKeys',
		'params.signatures',
	],
};

const createRegisterMultisignatureGroup = () => {
	const numMandatory = randomNumber(32);
	const numOptional = randomNumber(32);
	return {
		unsignedTransaction: {
			module: 'auth',
			command: 'registerMultisignature',
			nonce: randomUInt64().toString(),
			fee: randomUInt64().toString(),
			senderPublicKey: publicKey,
			params: {
				numberOfSignatures: randomNumber(64),
				mandatoryKeys: new Array(numMandatory)
					.fill(0)
					.map(() => utils.getRandomBytes(32).toString('hex')),
				optionalKeys: new Array(numOptional)
					.fill(0)
					.map(() => utils.getRandomBytes(32).toString('hex')),
				signatures: new Array(numMandatory + numOptional)
					.fill(0)
					.map(() => utils.getRandomBytes(64).toString('hex')),
			},
			signatures: [],
		},
		...registerMultisignatureGroupKeys,
	};
};

const registerDelegateKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.name'],
	detailKeys: [
		'module',
		'command',
		'fee',
		'params.name',
		'params.generatorKey',
		'params.blsKey',
		'params.proofOfPossession',
	],
};

const createRegisterDelegate = () => ({
	unsignedTransaction: {
		module: 'dpos',
		command: 'registerDelegate',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			name: randomWord(),
			blsKey: utils.getRandomBytes(48).toString('hex'),
			proofOfPossession: utils.getRandomBytes(96).toString('hex'),
			generatorKey: utils.getRandomBytes(32).toString('hex'),
			delegateRegistrationFee: randomUInt64().toString(),
		},
		signatures: [],
	},
	...registerDelegateKey,
});

const voteDelegateKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.votes'],
	detailKeys: ['module', 'command', 'fee', 'params.votes'],
};

const createVoteDelegate = () => ({
	unsignedTransaction: {
		module: 'dpos',
		command: 'voteDelegate',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			votes: new Array(randomNumber(20)).fill(0).map(() => ({
				delegateAddress: randomAddress(),
				amount: randomUInt64().toString(),
			})),
		},
		signatures: [],
	},
	...voteDelegateKey,
});

const unlockKey = {
	summaryKeys: ['module', 'command', 'fee'],
	detailKeys: ['module', 'command', 'fee'],
};

const createUnlock = () => ({
	unsignedTransaction: {
		module: 'dpos',
		command: 'unlock',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {},
		signatures: [],
	},
	...unlockKey,
});

const reportDelegateMisbehaviorKey = {
	summaryKeys: ['module', 'command', 'fee'],
	detailKeys: ['module', 'command', 'fee'],
};

const createReportDelegateMisbehavior = () => ({
	unsignedTransaction: {
		module: 'dpos',
		command: 'reportDelegateMisbehavior',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			header1: utils.getRandomBytes(60).toString('hex'),
			header2: utils.getRandomBytes(60).toString('hex'),
		},
		signatures: [],
	},
	...reportDelegateMisbehaviorKey,
});

const sidechainCCUpdateKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.sendingChainID'],
	detailKeys: ['module', 'command', 'fee', 'params.sendingChainID'],
};

const createCCUpdate = chain => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: `${chain}CrossChainUpdate`,
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			sendingChainID: utils.getRandomBytes(4).toString('hex'),
			certificate: utils.getRandomBytes(60).toString('hex'),
			activeValidatorsUpdate: new Array(randomNumber(103)).fill(0).map(() => ({
				blsKey: utils.getRandomBytes(48).toString('hex'),
				bftWeight: randomNumber(103).toString(),
			})),
			certificateThreshold: randomNumber(103).toString(),
			inboxUpdate: {
				crossChainMessages: new Array(randomNumber(30))
					.fill(0)
					.map(() => utils.getRandomBytes(30 + randomNumber(100)).toString('hex')),
				messageWitnessHashes: new Array(randomNumber(30))
					.fill(0)
					.map(() => utils.getRandomBytes(32).toString('hex')),
				outboxRootWitness: {
					bitmap: utils.getRandomBytes(8).toString('hex'),
					siblingHashes: new Array(randomNumber(8))
						.fill(0)
						.map(() => utils.getRandomBytes(32).toString('hex')),
				},
			},
		},
		signatures: [],
	},
	...sidechainCCUpdateKey,
});

const mainchainRegistrationKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.ownChainID', 'params.ownName'],
	detailKeys: ['module', 'command', 'fee', 'params.ownChainID', 'params.ownName'],
};

const createMainchainRegistration = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'mainchainRegistration',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			ownChainID: utils.getRandomBytes(4).toString('hex'),
			ownName: randomWord(),
			mainchainValidators: new Array(103).fill(0).map(() => ({
				blsKey: utils.getRandomBytes(48).toString('hex'),
				bftWeight: randomNumber(103).toString(),
			})),
			signature: utils.getRandomBytes(96).toString('hex'),
			aggregationBits: utils.getRandomBytes(randomNumber(8)).toString('hex'),
		},
		signatures: [],
	},
	...mainchainRegistrationKey,
});

const messageRecoveryKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.chainID'],
	detailKeys: ['module', 'command', 'fee', 'params.chainID'],
};

const createMessageRecovery = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'messageRecovery',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			chainID: utils.getRandomBytes(4).toString('hex'),
			crossChainMessages: new Array(randomNumber(30))
				.fill(0)
				.map(() => utils.getRandomBytes(30 + randomNumber(100)).toString('hex')),
			idxs: new Array(randomNumber(16))
				.fill(0)
				.map(() => randomNumber(256))
				.sort((a, b) => a - b),
			siblingHashes: new Array(randomNumber(16))
				.fill(0)
				.map(() => utils.getRandomBytes(32).toString('hex')),
		},
		signatures: [],
	},
	...messageRecoveryKey,
});

const messageRecoveryInitializationKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.chainID'],
	detailKeys: ['module', 'command', 'fee', 'params.chainID'],
};

const createMessageRecoveryInitialization = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'messageRecoveryInitialization',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			chainID: utils.getRandomBytes(4).toString('hex'),
			bitmap: utils.getRandomBytes(randomNumber(8)).toString('hex'),
			channel: utils.getRandomBytes(80).toString('hex'),
			siblingHashes: new Array(randomNumber(16))
				.fill(0)
				.map(() => utils.getRandomBytes(32).toString('hex')),
		},
		signatures: [],
	},
	...messageRecoveryInitializationKey,
});

const sidechainRegistrationKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.name'],
	detailKeys: ['module', 'command', 'fee', 'params.name', 'params.chainID'],
};

const createSidechainRegistration = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'sidechainRegistration',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			chainID: utils.getRandomBytes(4).toString('hex'),
			name: randomWord(),
			initValidators: new Array(randomNumber(103) + 1).fill(0).map(() => ({
				blsKey: utils.getRandomBytes(48).toString('hex'),
				bftWeight: randomNumber(103).toString(),
			})),
			certificateThreshold: randomNumber(103).toString(),
			sidechainRegistrationFee: randomUInt64().toString(),
		},
		signatures: [],
	},
	...sidechainRegistrationKey,
});

const stateRecoveryInitializationKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.chainID'],
	detailKeys: ['module', 'command', 'fee', 'params.chainID'],
};

const createStateRecoveryInitialization = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'stateRecoveryInitialization',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			chainID: utils.getRandomBytes(4).toString('hex'),
			sidechainChainAccount: utils.getRandomBytes(50).toString('hex'),
			bitmap: utils.getRandomBytes(randomNumber(8)).toString('hex'),
			siblingHashes: new Array(randomNumber(16))
				.fill(0)
				.map(() => utils.getRandomBytes(32).toString('hex')),
		},
		signatures: [],
	},
	...stateRecoveryInitializationKey,
});

const stateRecoveryKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.chainID', 'params.module'],
	detailKeys: ['module', 'command', 'fee', 'params.chainID', 'params.module'],
};

const createStateRecovery = () => ({
	unsignedTransaction: {
		module: 'interoperability',
		command: 'stateRecovery',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			chainID: utils.getRandomBytes(4).toString('hex'),
			module: utils.getRandomBytes(4).toString('hex'),
			storeEntries: new Array(randomNumber(16)).fill(0).map(() => ({
				storePrefix: utils.getRandomBytes(2).toString('hex'),
				storeKey: utils.getRandomBytes(randomNumber(50)).toString('hex'),
				storeValue: utils.getRandomBytes(randomNumber(100)).toString('hex'),
				bitmap: utils.getRandomBytes(randomNumber(8)).toString('hex'),
			})),
			siblingHashes: new Array(randomNumber(16))
				.fill(0)
				.map(() => utils.getRandomBytes(32).toString('hex')),
		},
		signatures: [],
	},
	...stateRecoveryKey,
});

const reclaimLSKKey = {
	summaryKeys: ['module', 'command', 'fee', 'params.amount'],
	detailKeys: ['module', 'command', 'fee', 'params.amount'],
};

const createReclaimLSK = () => ({
	unsignedTransaction: {
		module: 'legacy',
		command: 'reclaimLSK',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			amount: randomUInt64().toString(),
		},
		signatures: [],
	},
	...reclaimLSKKey,
});

const registerKeysKey = {
	summaryKeys: ['module', 'command', 'fee'],
	detailKeys: [
		'module',
		'command',
		'fee',
		'params.generatorKey',
		'params.blsKey',
		'params.proofOfPossession',
	],
};

const createRegisterKeys = () => ({
	unsignedTransaction: {
		module: 'legacy',
		command: 'registerKeys',
		nonce: randomUInt64().toString(),
		fee: randomUInt64().toString(),
		senderPublicKey: publicKey,
		params: {
			blsKey: utils.getRandomBytes(48).toString('hex'),
			proofOfPossession: utils.getRandomBytes(96).toString('hex'),
			generatorKey: utils.getRandomBytes(32).toString('hex'),
		},
		signatures: [],
	},
	...registerKeysKey,
});

const createData = count => {
	const data = [];
	data.push(...new Array(count).fill(0).map(() => createTokenTransfer()));
	data.push(...new Array(count).fill(0).map(() => createCrossChainTokenTransfer()));
	data.push(...new Array(count).fill(0).map(() => createRegisterMultisignatureGroup()));
	data.push(...new Array(count).fill(0).map(() => createRegisterDelegate()));
	data.push(...new Array(count).fill(0).map(() => createVoteDelegate()));
	data.push(...new Array(count).fill(0).map(() => createUnlock()));
	data.push(...new Array(count).fill(0).map(() => createReportDelegateMisbehavior()));
	data.push(...new Array(count).fill(0).map(() => createCCUpdate('mainchain')));
	data.push(...new Array(count).fill(0).map(() => createCCUpdate('sidechain')));
	data.push(...new Array(count).fill(0).map(() => createMainchainRegistration()));
	data.push(...new Array(count).fill(0).map(() => createMessageRecovery()));
	data.push(...new Array(count).fill(0).map(() => createMessageRecoveryInitialization()));
	data.push(...new Array(count).fill(0).map(() => createSidechainRegistration()));
	data.push(...new Array(count).fill(0).map(() => createStateRecoveryInitialization()));
	data.push(...new Array(count).fill(0).map(() => createStateRecovery()));
	data.push(...new Array(count).fill(0).map(() => createReclaimLSK()));
	data.push(...new Array(count).fill(0).map(() => createRegisterKeys()));
	return data;
};

(async () => {
	const smallData = createData(1);
	fs.writeFileSync(
		path.join(__dirname, 'tx_samples.json'),
		JSON.stringify(
			{
				chainID: '00000000',
				privateKey,
				data: smallData,
			},
			undefined,
			'  ',
		),
	);
	const bigData = createData(100);
	fs.writeFileSync(
		path.join(__dirname, 'tx_samples_big.json'),
		JSON.stringify(
			{
				chainID: '00000000',
				privateKey,
				data: bigData,
			},
			undefined,
			'  ',
		),
	);
})();
