const fs = require('fs');

async function getCompanyList(country) {
    const { getList } = require('./scrapers/' + country);
    return getList();
}

async function processList(country, list) {
    const { getDetails } = require('./scrapers/' + country);

    if(list.length > 0) {
        let entities = [];
        for(let i=0; i<list.length; i++) {
            console.log(list[i].name);
            if(list[i].subclassification != 'stock-exchange') {
                let details = await getDetails(list[i]);
                entities.push(details);
            }
        }
        return entities;
    }
    else {
        console.log('ERROR: no companies found!');
        process.exit(1);
    }
}

function saveEntities(entities, country) {
    let metadata = {
        source: [ {'id': 'mujeres2020'} ],
        sourceRun: [ {'id': 'mujeres2020-' + Date.now()} ],
        date: new Date().toISOString()
    }

    if(entities.hasOwnProperty('companies')) {
        let companyLines = []
        entities.companies.map( (company) => {
            Object.assign(company, metadata);
            companyLines.push( JSON.stringify(company) );
        } );
        fs.writeFileSync('./data/' + country + '-companies.json', companyLines.join("\n"));
        console.log(companyLines.length + ' companies recorded.');
    }
    if(entities.hasOwnProperty('persons')) {
        let personLines = []
        entities.persons.map( (person) => {
            Object.assign(person, metadata);
            personLines.push( JSON.stringify(person) );
        } );
        fs.writeFileSync('./data/' + country + '-persons.json', personLines.join("\n"));
        console.log(personLines.length + ' persons recorded.');
    }
    if(entities.hasOwnProperty('memberships')) {
        let memberLines = []
        entities.memberships.map( (member) => {
            Object.assign(member, metadata);
            memberLines.push( JSON.stringify(member) );
        } );
        fs.writeFileSync('./data/' + country + '-memberships.json', memberLines.join("\n"));
        console.log(memberLines.length + ' memberships recorded.');
    }
}

module.exports = { getCompanyList, processList, saveEntities }
