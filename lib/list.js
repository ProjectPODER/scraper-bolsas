async function getCompanyList(country) {
    const { getList } = require('./scrapers/' + country);
    console.log('Getting list for ' + country);
    return getList();
}

async function processList(country, companies) {
    const { getDetails } = require('./scrapers/' + country);
    console.log('Processing companies...');

    if(companies.length > 0) {
        let promises = [];
        companies.map( (company) => {
            console.log('Getting details for ' + company.name);
            promises.push(getDetails(company));
        } )

        return Promise.all(promises);
    }
}

module.exports = { getCompanyList, processList }
