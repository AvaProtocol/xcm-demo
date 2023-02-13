import MangataDevAutoCompound from './mangataDevAutoCompound';

/** * Main entrance of the program */
async function main() {
    const mangataDevAutoCompound = new MangataDevAutoCompound();
    await mangataDevAutoCompound.initialize();
    await mangataDevAutoCompound.run();
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
