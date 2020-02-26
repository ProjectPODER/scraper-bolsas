const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa de Valores de Colombia';

async function getList() {
    const listURL = 'https://www.superfinanciera.gov.co/Superfinanciera-Simev/generic/FinancialInstitutionSimevList.seam?nationalRecordId=1&financialInstitutionStateRNVEIId=1';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });

        await page.$eval('#financialInstitutionSearch\\:j_id36\\:agrupationTypesIds\\:source\\:\\:1 > td:nth-child(1)', button => button.click() );
        await page.$eval('#financialInstitutionSearch\\:j_id36\\:agrupationTypesIdscopylink', button => button.click() );
        await page.$eval('#financialInstitutionSearch\\:search', button => button.click() );
        await page.waitFor(5000);
        await page.waitForSelector('#resultForm\\:financialInstitutionSimevList\\:tb');

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name:'BVC'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'co',
                name: 'CO',
                classification: 'country'
            }],
            links: [{id: 'https://www.bvc.com.co'}]
        }
        companies.push(bolsaCompany);

        let table = await page.$$eval('#resultForm\\:financialInstitutionSimevList\\:tb tr.rich-table-row', trs => trs.map((tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                switch(i) {
                    case 5:
                        return td.querySelector('a').getAttribute('href');
                    default:
                        return td.textContent.trim();
                }
            });
        }));

        table.map( (row) => {
            companies.push( buildCompany(row) );
        } );

        await browser.close();
        console.log('Found ' + table.length + ' companies.');
        return companies;
    }
    catch (err) {
        console.log(err);
        await browser.close();
        return { status: 'error', results: err };
    }
}

function buildCompany(row) {
    let url = 'https://www.superfinanciera.gov.co' + row[5];
    let name = row[0];
    let sector = row[2];
    let identificacion = row[4];

    let company = {
        id: laundry.simpleName(laundry.launder(name)),
        name: name,
        classification: 'company',
        subclassification: sector,
        identifiers:[{
            identifier: identificacion,
            scheme: 'NIT'
        }],
        area: [{
            id: 'co',
            name: 'CO',
            classification: 'country'
        }],
        links: [ { id: url } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;
    let consejeres = [];
    let memberships = [];

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'load', timeout: 60000 });
    }
    catch(e) {
        console.log(e);
        await browser.close();
        return {
            persons: consejeres,
            memberships: memberships
        }
    }

    if(!page.$('.footerSimev > a')) {
        console.log('Link for board not found...');
        return {
            persons: consejeres,
            memberships: memberships
        }
    }

    let direccion = '';
    let ciudad = '';
    let telefono = '';
    let website = '';
    try {
        if( page.$('#address span.value2') ) {
            direccion = await page.$eval('#address span.value2', elem => elem.textContent.trim());
        }
        if( page.$('#city span.value2') ) {
            ciudad = await page.$eval('#city span.value2', elem => elem.textContent.trim());
        }
        if( page.$('#telephone span.value2') ) {
            telefono = await page.$eval('#telephone span.value2', elem => elem.textContent.trim());
        }
        if( page.$('#url span.value2') ) {
            website = await page.$eval('#url span.value2', elem => elem.textContent.trim());
        }
    }
    catch(e) {
        console.log(e);
    }

    try {
        await page.$eval('div.footerSimev:nth-child(5) > a:nth-child(2)', button => button.click());
        await page.waitForSelector('#collapsiblePanelJuntaDirectiva\\:content', { timeout:60000 });

        let realName = await page.$eval('.body > p:nth-child(2)', elem => elem.textContent.trim());
        company.id = laundry.simpleName(laundry.launder(realName));
        company.name = realName;

        if(direccion) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "office",
                "label": "Primary address",
                "value": direccion
            });
        }
        if(ciudad) {
            company.area.push({
                "name": ciudad,
                "classification": "city"
            });
        }
        if(telefono) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "voice",
                "label": "Primary telephone number",
                "value": telefono
            });
        }
        if(website) { company.links.push({id:website}) }

        // Membership de empresa a bolsa
        let companyStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + company.id + '-se';
        let companyStockMembership = {
            id: companyStockMemberID,
            role: "Emisor de Acciones",
            organization_id: company.id,
            organization_name: company.name,
            organization_class: "company",
            parent_id: laundry.simpleName(laundry.launder(bolsa)),
            parent_name: bolsa,
            parent_class: "company",
            parent_subclass: "stock-exchange"
        }
        memberships.push(companyStockMembership);

        if(!page.$('#listaJuntaDirectiva')) {
            console.log('Junta directiva not found...');
            return {
                persons: consejeres,
                memberships: memberships
            }
        }
        let table = await page.$$eval('#listaJuntaDirectiva tbody tr.rf-dt-r', trs => trs.map((tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => { return td.textContent.trim() } );
        }));

        table.map( (row) => {
            let consejereID = laundry.simpleName(laundry.launder(row[2]));
            let consejere = {
                id: consejereID,
                name: row[2],
                identifiers: [{
                    identifier: row[1],
                    scheme: row[0]
                }],
                area: [{
                    id: 'co',
                    name: 'CO',
                    classification: 'country'
                }]
            }
            consejeres.push(consejere);

            let memberID = company.id + '_' + consejereID + '-bm';
            let membership = {
                id: memberID,
                role: "Boardmember",
                organization_id: company.id,
                organization_name: company.name,
                organization_class: "company",
                parent_id: consejereID,
                parent_name: row[2],
                parent_class: "person",
                title: row[3],
                start_date: row[5]
            }
            if(row[6]) membership.end_date = row[6];
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: row[2],
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        } );

        await page.waitFor(5000);
        await browser.close();
        console.log(consejeres.length + ' persons found.');
        return {
            persons: consejeres,
            memberships: memberships
        }
    }
    catch(e) {
        console.log(e);
        await browser.close();
        return {
            persons: consejeres,
            memberships: memberships
        }
    }
}

module.exports = { getList, getDetails }
