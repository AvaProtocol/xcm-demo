import { Turing, Shiden } from '../config';
import AstarAutoCompound from './AstarAutoCompound';

const main = async () => {
    const astarAutoCompound = new AstarAutoCompound(Turing, Shiden);
    await astarAutoCompound.run();
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
