import { Turing, Moonriver } from '../config';
import autoCompound from './common';

autoCompound(Turing, Moonriver).catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
