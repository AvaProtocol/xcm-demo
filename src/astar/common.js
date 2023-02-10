import { sendExtrinsic } from '../common/utils';
import { TURING_INSTRUCTION_WEIGHT } from './constants';

// eslint-disable-next-line import/prefer-default-export
export const scheduleTask = async ({
    turingHelper, shibuyaHelper, parachainTaskExtrinsic, turingAddress, parachainAddress, paraTokenIdOnTuring, proxyAccountId, proxyTypeParachain, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');

    const task = parachainTaskExtrinsic || shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const taskPayload = shibuyaHelper.createTaskPayload({
        task,
        parachainAddress,
        proxyTypeParachain,
    });

    console.log('\nb) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');

    const xcmpTask = turingHelper.createScheduleXcmpTask({
        turingAddress,
        parachainId: shibuyaHelper.config.paraId,
        taskPayload,
    });

    const {
        requireWeightAtMost, encodedTaskViaProxy, nextExecutionTime, providedId,
    } = xcmpTask;

    console.log(`\nc) Execute the above an XCM from ${shibuyaHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
    const feePerSecond = await turingHelper.getFeePerSecond(paraTokenIdOnTuring);
    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: turingHelper.config.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyAccountId,
        feePerSecond,
        instructionWeight: TURING_INSTRUCTION_WEIGHT,
        requireWeightAtMost,
    });
    await sendExtrinsic(shibuyaHelper.api, xcmpExtrinsic, keyPair);

    console.log(`\nAt this point if the XCM succeeds, you should see the below events on both chains:\n
1. Shibuya\n
xcmpQueue.XcmpMessageSent and polkadotXcm.Sent - an XCM is successfully sent from Shibuya to Turing to schedule a task.\n
2. Turing Dev\n
a) proxy.ProxyExecuted and automationTime.TaskScheduled - the above XCM is received and executed on Turing.\n
b) xcmpHandler.XcmTransactedLocally, xcmpQueue.XcmpMessageSent, xcmpHandler.XcmSent and automationTime.XcmpTaskSucceeded - the task is triggered and its payload is sent to Shibuya via XCM.\n
3. Shibuya\n
proxy.ProxyExecuted and xcmpQueue.Success - the above payload is received and executed.\n`);

    const taskIdCodec = await turingHelper.api.rpc.automationTime.generateTaskId(turingAddress, providedId);
    const taskId = taskIdCodec.toString();

    return { providedId, taskId, executionTime: nextExecutionTime };
};
