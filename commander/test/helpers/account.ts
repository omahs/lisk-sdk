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
 *
 */

import * as cryptography from '@liskhq/lisk-cryptography';
import * as liskPassphrase from '@liskhq/lisk-passphrase';

const { Mnemonic } = liskPassphrase;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createAccount = () => {
	const passphrase = Mnemonic.generateMnemonic();
	const { privateKey, publicKey } = cryptography.legacy.getKeys(passphrase);
	const address = cryptography.address.getAddressFromPublicKey(publicKey);

	return {
		passphrase,
		privateKey,
		publicKey,
		address,
	};
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createAccounts = (numberOfAccounts = 1) => {
	const accounts = new Array(numberOfAccounts).fill(0).map(createAccount);
	return accounts;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const createFakeDefaultAccount = (account: any) => ({
	address: account?.address ?? cryptography.utils.getRandomBytes(20),
	token: {
		balance: account?.token?.balance ?? BigInt(0),
	},
	sequence: {
		nonce: account?.sequence?.nonce ?? BigInt(0),
	},
	keys: {
		mandatoryKeys: account?.keys?.mandatoryKeys ?? [],
		optionalKeys: account?.keys?.optionalKeys ?? [],
		numberOfSignatures: account?.keys?.numberOfSignatures ?? 0,
	},
	pos: {
		validator: {
			username: account?.pos?.validator?.username ?? '',
			pomHeights: account?.pos?.validator?.pomHeights ?? [],
			consecutiveMissedBlocks: account?.pos?.validator?.consecutiveMissedBlocks ?? 0,
			lastForgedHeight: account?.pos?.validator?.lastForgedHeight ?? 0,
			isBanned: account?.pos?.validator?.isBanned ?? false,
			totalStakeReceived: account?.pos?.validator?.totalStakeReceived ?? BigInt(0),
		},
		sentStakes: account?.pos?.sentStakes ?? [],
		unlocking: account?.pos?.unlocking ?? [],
	},
});

export const uninitializedAccount = [
	{
		passphrase: 'salad lawn air dentist enforce purity arctic jewel net neck alone mention',
		privateKey: Buffer.from(
			'80989c2bac40fc16819b87ee35257386ac852eac042dd8043eb19192b2fa21f438262844cf23c096aca2dad2e4cd75d50491ac30c89f84c83932d04ea903ef4c',
			'hex',
		),
		publicKey: Buffer.from(
			'38262844cf23c096aca2dad2e4cd75d50491ac30c89f84c83932d04ea903ef4c',
			'hex',
		),
		address: Buffer.from('8789de4316d79d22', 'hex'),
		oldAddress: '9766581646657035554L',
	},
	{
		passphrase: 'one mask tip slush fog topple acid noodle visual gadget trial wool',
		privateKey: Buffer.from(
			'855ce4e2ba5bdb1207f0cc48fb9ac180a6ce9f4cd3f10956a64a013feef82cc78cc7044fcf1b5b98f121e97d6af7b7b03049e49b7b184ba59627b68f0f059e76',
			'hex',
		),
		publicKey: Buffer.from(
			'8cc7044fcf1b5b98f121e97d6af7b7b03049e49b7b184ba59627b68f0f059e76',
			'hex',
		),
		address: Buffer.from('bdf994ff9c884ffa', 'hex'),
		oldAddress: '13689136367933083642L',
	},
];

export const accountsForMultisignature = {
	targetAccount: {
		passphrase: 'inherit moon normal relief spring bargain hobby join baby flash fog blood',
		privateKey: Buffer.from(
			'de4a28610239ceac2ec3f592e36a2ead8ed4ac93cb16aa0d996ab6bb0249da2c0b211fce4b615083701cb8a8c99407e464b2f9aa4f367095322de1b77e5fcfbe',
			'hex',
		),
		publicKey: Buffer.from(
			'0b211fce4b615083701cb8a8c99407e464b2f9aa4f367095322de1b77e5fcfbe',
			'hex',
		),
		address: Buffer.from('be046d336cd0c2fbde62bc47e20199395d2eeadc', 'hex'),
	},
	mandatoryOne: {
		passphrase: 'trim elegant oven term access apple obtain error grain excite lawn neck',
		privateKey: Buffer.from(
			'8a138c0dd8efe597c8b9c519af69e9821bd1e769cf0fb3490e22209e9cabfb8df1b9f4ee71b5d5857d3b346d441ca967f27870ebee88569db364fd13e28adba3',
			'hex',
		),
		publicKey: Buffer.from(
			'f1b9f4ee71b5d5857d3b346d441ca967f27870ebee88569db364fd13e28adba3',
			'hex',
		),
		address: Buffer.from('652bac0f3ef175917844a85c4a0a484fbe2395e4', 'hex'),
	},
	mandatoryTwo: {
		passphrase: 'desk deposit crumble farm tip cluster goose exotic dignity flee bring traffic',
		privateKey: Buffer.from(
			'ddc8e19d6697d6e5c1dacf6576a7169752810999918212afe14d3978b354f8aa4a67646a446313db964c39370359845c52fce9225a3929770ef41448c258fd39',
			'hex',
		),
		publicKey: Buffer.from(
			'4a67646a446313db964c39370359845c52fce9225a3929770ef41448c258fd39',
			'hex',
		),
		address: Buffer.from('ecb6308c3ee3cc2ed1fa266b85ba127d63a4ee1c', 'hex'),
	},
	optionalOne: {
		passphrase: 'sugar object slender confirm clock peanut auto spice carbon knife increase estate',
		privateKey: Buffer.from(
			'69aa94ea7ade3b7b08e277b18c1a590b2306ce5973ae8462b0b85122b180e89c57df5c3811961939f8dcfa858c6eaefebfaa4de942f7e703bf88127e0ee9cca4',
			'hex',
		),
		publicKey: Buffer.from(
			'57df5c3811961939f8dcfa858c6eaefebfaa4de942f7e703bf88127e0ee9cca4',
			'hex',
		),
		address: Buffer.from('74a7c8ec9adc7e6ba5c1cf9410d5c6c6bf6aba7d', 'hex'),
	},
	optionalTwo: {
		passphrase: 'faculty inspire crouch quit sorry vague hard ski scrap jaguar garment limb',
		privateKey: Buffer.from(
			'ffed38380998a90a2af9501f10182bc2a07922448ab383575b1e34aeddfa5482fa406b6952d377f0278920e3eb8da919e4cf5c68b02eeba5d8b3334fdc0369b6',
			'hex',
		),
		publicKey: Buffer.from(
			'fa406b6952d377f0278920e3eb8da919e4cf5c68b02eeba5d8b3334fdc0369b6',
			'hex',
		),
		address: Buffer.from('e661c9ff02f65962ac08bc79a2f5c0d44b312fbc', 'hex'),
	},
};
