const { fetchStations } = require('./fetch');

function createBonareaCollector(options = {}) {
  return {
    name: 'bonarea',
    country: 'ES',
    async fetch(context = {}) {
      const reportProgress =
        typeof context?.reportProgress === 'function' ? context.reportProgress : () => {};
      return fetchStations(options, { reportProgress });
    },
  };
}

module.exports = {
  createBonareaCollector,
};
