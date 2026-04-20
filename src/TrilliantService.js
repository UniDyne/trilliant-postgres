const {Pool} = require('pg');

const { loadQueries } = require('./QueryJobs');

module.exports = class TrilliantService extends ServiceWrapper {
    #pool;

    constructor(app, config) {
        super(app, config);

        this.#pool = new Pool(config);
    }

    start() { }
    stop() {
        (async () => await this.#pool.end())();
    }

    register(plug, data) {

    }

    getConnection() {
        return this.#pool;
    }

    loadQueries(q, homeDir) {
        return loadQueries(q, homeDir, this);
    }
};