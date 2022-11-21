import _ from 'lodash';

export const sendExtrinsic = async (api, extrinsic, keyPair, { isSudo = false } = {}) => {
	return new Promise((resolve) => {

    const newExtrinsic = isSudo ? api.tx.sudo.sudo(extrinsic) : extrinsic;
		newExtrinsic.signAndSend(keyPair, { nonce: -1 }, ({ status, dispatchError }) => {
			console.log("status.type", status.type);
			if (status.type === 'Finalized') {
				console.log('Finalize extrinsic in block: ', status.asFinalized.toString());

				if (!_.isNil(dispatchError)) {
					if (dispatchError.isModule) {
						const metaError = api.registry.findMetaError(dispatchError.asModule)
						const { docs, name, section } = metaError
						const dispatchErrorMessage = JSON.stringify({ docs, name, section })
						const errMsg = `Transaction finalized with error by blockchain ${dispatchErrorMessage}`
						console.log(errMsg)
					} else {
						const errMsg = `Transaction finalized with error by blockchain ${dispatchError.toString()}`
						console.log(errMsg)
					}
				}

				resolve(status.asFinalized.toString());
			}
		});
	});
}