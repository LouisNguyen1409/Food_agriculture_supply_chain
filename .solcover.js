module.exports = {
    skipFiles: [
        'mock/',
        'Oracle/'
    ],
    providerOptions: {
        mnemonic: process.env.MNEMONIC,
    },
    mocha: {
        grep: "@skip-on-coverage", // Find everything with this tag
        invert: true               // Run the inverse set.
    }
}; 