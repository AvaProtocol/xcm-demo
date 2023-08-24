import { TuringMoonbase, MoonbaseAlpha } from '../config';
import autoCompound from './common';

autoCompound(TuringMoonbase, MoonbaseAlpha).catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
