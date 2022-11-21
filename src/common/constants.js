const env={
    MANGATA_PARA_ID: process.env.MANGATA_PARA_ID,
    MANGATA_ENDPOINT: process.env.TARGET_ENDPOINT,
    TURING_PARA_ID: process.env.MANGATA_PARA_ID,
    TURING_ENDPOINT: process.env.TURING_ENDPOINT,
}

const chainConfig={
    "rococo":{
        ss58: 42,
    },
    "turing":{
        ss58:51
    },
    "mangata":{
        ss58: 42
    }
}

const tokenConfig={
    MGR: {
        decimal:'1000000000000000000'
    },
    ROC: {
        decimal: '1000000000000'
    },
    TUR: {
        decimal:'10000000000'
    },
    "MGR-TUR": {
        decimal:'1000000000000000000'
    }
}

export {env, chainConfig, tokenConfig};