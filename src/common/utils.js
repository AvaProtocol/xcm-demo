import _ from 'lodash';
import BN from 'bn.js';
import fs from 'fs';
import path from 'path';
import moment from 'moment';
import select from '@inquirer/select';

const LISTEN_EVENT_DELAY = 3 * 60;

export const WEIGHT_REF_TIME_PER_SECOND = 1000000000000;
export const WEIGHT_PROOF_SIZE_PER_MB = 1024 * 1024;
export const TIME_SLOT_IN_SECONDS = 600;

export const ScheduleActionType = {
    executeImmediately: 'execute-immediately',
    executeOnTheHour: 'execute-on-the-hour',
};

export const sendExtrinsic = async (api, extrinsic, keyPair, { isSudo = false } = {}) => new Promise((resolve) => {
    const newExtrinsic = isSudo ? api.tx.sudo.sudo(extrinsic) : extrinsic;
    newExtrinsic.signAndSend(keyPair, { nonce: -1 }, ({ status, events }) => {
        console.log('status.type', status.type);

        if (status.isInBlock || status.isFinalized) {
            events
            // find/filter for failed events
                .filter(({ event }) => api.events.system.ExtrinsicFailed.is(event))
            // we know that data for system.ExtrinsicFailed is
            // (DispatchError, DispatchInfo)
                .forEach(({ event: { data: [error] } }) => {
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

            if (status.isFinalized) {
                resolve({ events, blockHash: status.asFinalized.toString() });
            }
        }
    });
});

/**
* Usage: await delay(1000)
* @param  {number} ms) [description]
* @return {Promise}    [description]
*/
export const delay = async (ms) => new Promise((res) => { setTimeout(res, ms); });

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
export const waitForEvent = async (api, method, blocks = 3) => new Promise((resolve, reject) => {
    let counter = 0;
    const unsub = api.rpc.chain.getFinalizedHead(async (head) => {
        await api.query.system.events((events) => {
            counter += 1;
            console.log(`await event check for '${method}', attempt ${counter}, head ${head}`);
            events.forEach(({ phase, event: { data, section } }) => {
                console.log(phase, data, method, section);
            });
            const foundEvent = _.find(events, ({ event }) => `${event.section}.${event.method}` === method);
            if (foundEvent) {
                resolve();
                unsub();
                // } else {
                //   reject(new Error("event not found"));
            }
            if (counter === blocks) {
                reject(new Error(`method ${method} not found within blocks limit`));
            }
        });
    });
});

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

/**
 * Return a BN object for the power of 10, for example getDecimalBN(10) returns new BN(10,000,000,000)
 * @param {*} decimals The decimals number of a token
 */
export function getDecimalBN(decimals) {
    const base = new BN(10, 10);
    const power = new BN(decimals, 10);
    return base.pow(power);
}

export const getProxies = async (api, address) => {
    const proxiesResponse = await api.query.proxy.proxies(address);
    const proxies = proxiesResponse.toJSON()[0];
    return proxies;
};

/**
 * Listen events from chain
 * @param {*} api
 * @param {*} section
 * @param {*} method
 * @param {*} timeout - Set timeout to stop event listening.
 * @returns
 */
export const listenEvents = async (api, section, method, dataConditionFunc, timeout = undefined) => new Promise((resolve) => {
    let unsub = null;
    let timeoutId = null;

    if (timeout) {
        timeoutId = setTimeout(() => {
            unsub();
            resolve(null);
        }, timeout);
    }

    const listenSystemEvents = async () => {
        unsub = await api.query.system.events((events) => {
            const foundEventIndex = _.findIndex(events, ({ event }) => {
                const { section: eventSection, method: eventMethod, data } = event;
                if (eventSection !== section || eventMethod !== method) {
                    return false;
                }

                return _.isUndefined(dataConditionFunc) || dataConditionFunc(data);
            });

            if (foundEventIndex !== -1) {
                const foundEvent = events[foundEventIndex];
                const {
                    event: {
                        section: eventSection, method: eventMethod, typeDef: types, data: eventData,
                    }, phase,
                } = foundEvent;

                // Print out the name of the event found
                console.log(`\t${eventSection}:${eventMethod}:: (phase=${phase.toString()})`);

                // Loop through the conent of the event, displaying the type and data
                eventData.forEach((data, index) => {
                    console.log(`\t\t\t${types[index].type}: ${data.toString()}`);
                });

                unsub();

                if (timeoutId) {
                    clearTimeout(timeoutId);
                }

                resolve({
                    events,
                    foundEvent,
                    foundEventIndex,
                });
            }
        });
    };

    listenSystemEvents().catch(console.log);
});

/*
 * Return a JSON file of a wallet
 * @returns a JSON, to be used for keyring.addFromJson(json);
 */
export const readMnemonicFromFile = async () => {
    const jsonPath = path.join(__dirname, '../../private', 'seed.json');
    const json = await fs.promises.readFile(jsonPath);
    return JSON.parse(json);
};

export const readEthMnemonicFromFile = async () => {
    const jsonPath = path.join(__dirname, '../../private', 'seed-eth.json');
    const json = await fs.promises.readFile(jsonPath);
    return JSON.parse(json);
};

export const calculateTimeout = (executionTime) => (executionTime - moment().valueOf() / 1000 + LISTEN_EVENT_DELAY) * 1000;

export const askScheduleAction = async () => {
    const actions = [
        {
            name: 'Execute immediately',
            value: ScheduleActionType.executeImmediately,
            description: 'Execute task immediately.',
        },
        {
            name: 'Execute on the hour',
            value: ScheduleActionType.executeOnTheHour,
            description: 'Execute task on the hour.',
        },
    ];
    const actionSelected = await select({
        message: 'Select an action to perform',
        choices: actions,
    });
    return actionSelected;
};

/**
 * Get the selected asset from the user
 * @param {*} message The message to be displayed to the user
 * @param {*} assets The list of assets to be selected
 * @returns the selected asset
 */
export const getSelectedAsset = async (message, assets) => {
    const choices = _.map(assets, (asset) => ({
        name: asset.symbol,
        value: asset,
        description: asset.symbol,
    }));
    return select({ message, choices });
};

/**
 * Convert a BN object to float such as 0.0135
 * @param {*} amountBN
 * @param {*} decimalBN
 * @param {*} digit the number of digits of the float; by default 4
 * @returns a float number
 */
export const bnToFloat = (amountBN, decimalBN, digit = 4) => {
    const amplifier = 10 ** digit;
    const digitBN = new BN(amplifier);

    const resultBN = amountBN.mul(digitBN).div(decimalBN);
    return _.floor(resultBN.toNumber() / amplifier, digit);
};

export const getHourlyTimestamp = (hour) => (moment().add(hour, 'hour').startOf('hour')).valueOf();

/**
 * Get the timestamp on time slot
 * @param {*} numberOfTimeSlot the number of timeslot, e.g. 1, 2, 3, 4
 * @returns a timestamp in milliseconds
 */
export const getTimeSlotSpanTimestamp = (numberOfTimeSlot) => {
    // Get the current timestamp
    const currentTimeStampInSeconds = Math.floor(Date.now() / 1000);
    // Adjust the current timestamp to be a multiple of the timeslot
    const adjustedTime = currentTimeStampInSeconds
      - (currentTimeStampInSeconds % TIME_SLOT_IN_SECONDS);
    // Return the timestamp on time slot
    return (adjustedTime + numberOfTimeSlot * TIME_SLOT_IN_SECONDS) * 1000;
};

export const findEvent = (events, section, method) => events.find((e) => e.event.section === section && e.event.method === method);
export const getTaskIdInTaskScheduledEvent = (event) => Buffer.from(event.event.data.taskId).toString();

/**
 * Wait for all promises to succeed, otherwise throw an exception.
 * @param {*} promises
 * @returns promise
 */
export const waitPromises = (promises) => new Promise((resolve, reject) => {
    Promise.all(promises).then(resolve).catch(reject);
});

/**
 * Listen XCMP task events
 * @param {*} oakApi
 * @param {*} taskExecutionTime
 * @returns
 */
export const listenXcmpTaskEvents = async (oakApi, taskExecutionTime) => {
    console.log('Listen XCMP task events');
    const { foundEvent } = await listenEvents(oakApi, 'automationTime', 'TaskScheduled', undefined, 60000);
    const taskId = getTaskIdInTaskScheduledEvent(foundEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);

    const timeout = calculateTimeout(taskExecutionTime);
    console.log(`\nKeep Listening automationTime.TaskExecuted until ${moment(taskExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${taskExecutionTime}) to verify that the task(taskId: ${taskId}) will be successfully triggered ...`);
    const listenEventsResult = await listenEvents(
        oakApi,
        'automationTime',
        'TaskExecuted',
        ({ taskId: taskIdInEvent }) => Buffer.from(taskIdInEvent).toString() === taskId,
        timeout,
    );

    const { events, foundEventIndex: taskExecutedEventIndex } = listenEventsResult;
    const xcmpMessageSentEvent = _.findLast(
        events,
        ({ event: { section, method } }) => section === 'xcmpQueue' && method === 'XcmpMessageSent',
        taskExecutedEventIndex + 1,
    );
    console.log('XcmpMessageSent event: ', xcmpMessageSentEvent.toHuman());
    const { messageHash } = xcmpMessageSentEvent.event.data;
    console.log('messageHash: ', messageHash.toString());

    return { taskId, messageHash };
};
