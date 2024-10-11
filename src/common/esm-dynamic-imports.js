// Dynamic import function for ESM modules
const dynamicImport = async (packageName) => import(packageName);

module.exports = { dynamicImport };
