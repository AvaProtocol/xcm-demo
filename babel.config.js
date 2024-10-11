module.exports = {
    presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
    ],
    ignore: [
        // Ignore the esm-dynamic-imports.js file for loading ESM modules
        'src/common/esm-dynamic-imports.js',
    ],
};
