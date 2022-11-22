import _ from 'lodash';

export const sendExtrinsic = async (api, extrinsic, keyPair, { isSudo = false } = {}) => {
	return new Promise((resolve) => {

    const newExtrinsic = isSudo ? api.tx.sudo.sudo(extrinsic) : extrinsic;
		newExtrinsic.signAndSend(keyPair, { nonce: -1 }, ({ status, events, dispatchError }) => {
			console.log("status.type", status.type);

			if (status.isInBlock || status.isFinalized) {
				events
				// find/filter for failed events
				.filter(({ event }) =>api.events.system.ExtrinsicFailed.is(event))
				// we know that data for system.ExtrinsicFailed is
				// (DispatchError, DispatchInfo)
				.forEach(({ event: { data: [error, info] } }) => {
					if (error.isModule) {
						// for module errors, we have the section indexed, lookup
						const decoded = api.registry.findMetaError(error.asModule);
						const { docs, method, section } = decoded;
						console.log(`${section}.${method}: ${docs.join(' ')}`);
					} else {
						// Other, CannotLookup, BadOrigin, no extra info
						console.log(error.toString());
					}
				});

				if(status.isFinalized){
					return resolve(status.asFinalized.toString());
				}
			}
			// if (status.type === 'Finalized') {
			// 	console.log('Finalize extrinsic in block: ', status.asFinalized.toString());

			// 	if (!_.isNil(dispatchError)) {
			// 		if (dispatchError.isModule) {
			// 			const metaError = api.registry.findMetaError(dispatchError.asModule)
			// 			const { docs, name, section } = metaError
			// 			const dispatchErrorMessage = JSON.stringify({ docs, name, section })
			// 			const errMsg = `Transaction finalized with error by blockchain ${dispatchErrorMessage}`
			// 			console.log(errMsg)
			// 		} else {
			// 			const errMsg = `Transaction finalized with error by blockchain ${dispatchError.toString()}`
			// 			console.log(errMsg)
			// 		}
			// 	}

			// 	resolve(status.asFinalized.toString());
			// }
		});
	});
}

/**
* Usage: await delay(1000)
* @param  {[type]} ms) [description]
* @return {[type]}     [description]
*/
export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// @usage: await waitForEvent(mangataHelper.api, "xyk.LiquidityMinted");
// This is a utility function copied from https://github.com/mangata-finance/mangata-e2e/pull/166/files
// works most of the time, avoid using in the CI, used only in manual tests for now; or FIX please :)

/**
 * @usage await waitForEvent(mangataHelper.api, "xyk.LiquidityMinted");
 * This is a utility function copied from https://github.com/mangata-finance/mangata-e2e/pull/166/files
 * It works most of the time, avoid using in the CI, used only in manual tests for now; or FIX please :)
 * @param {ApiPromise} api 
 * @param {string} method 
 * @param {number} blocks starting block number; no idea why it is 3
 * @returns 
 */
export const waitForEvent = async (api,method,blocks = 3) => {
	return new Promise((resolve, reject) => {
		let counter = 0;
		const unsub = api.rpc.chain.getFinalizedHead(async (head) => {
		await api.query.system.events((events) => {
			counter++;
			console.log(`await event check for '${method}', attempt ${counter}, head ${head}`);
			events.forEach(({ phase, event: { data, method, section } }) => {
				console.log(phase, data, method, section);
			});
			const event = _.find(events,({ event }) => `${event.section}.${event.method}` === method);
			if (event) {
				resolve();
				unsub();
				// } else {
				//   reject(new Error("event not found"));
			}
			if (counter === blocks) {
				reject(`method ${method} not found within blocks limit`);
			}
		});
	});
	});
  };

  /**
 * Formatting number with thousand separator.
 * @param  {number} num e.g. 1000000.65
 * @return {string}   "1,000,000.65"
 */
export function formatNumberThousands(num) {
	if (_.isUndefined(num)) {
		return num;
	}
  
	const numStr = num.toString();
	const parts = numStr.split('.');
  
	const decimalStr = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const period = _.isUndefined(parts[1]) ? '' : '.';
	const floatStr = _.isUndefined(parts[1]) ? '' : parts[1];
  
	return `${decimalStr}${period}${floatStr}`;
  }