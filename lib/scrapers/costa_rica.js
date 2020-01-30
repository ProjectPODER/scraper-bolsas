const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa Nacional de Valores';

async function getList() {
    const listURL = 'https://aplicaciones.sugeval.fi.cr/RNVI/ConsultaEmisor/ConsultaEmisor.aspx';

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('td.DataCell');

        await page.waitFor(3000); // Esperar para que no de error

        let pagination = await page.$eval('#GridResultados_footer div.GridFooterText', elem => elem.innerHTML);
        let numPages = getMatches(pagination, /<b>(.*?)<\/b>/g, 1)[1];
        let currentPage = 1;
        let totalRegex = /\((.*?)\)/g;
        let totalResults = totalRegex.exec(pagination)[1].replace(' elementos', '');
        // let totalResults = 3;
        let resultsPerPage = 10;

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name:'BNV'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'cr',
                name: 'CR',
                classification: 'country'
            }],
            links: [{id: 'https://www.bolsacr.com'}]
        }
        companies.push(bolsaCompany);

        let consejeres = [];
        let memberships = [];
        console.log('Processing page ' + currentPage);
        for(let i=0; i<totalResults; i++) {
            await page.waitFor(3000); // Esperar para que no de error
            let rowID = '#GridResultados_row_' + i;
            let rowData = await getRowData(rowID, page);
            let company = buildCompany(rowData);
            console.log(i + ': ' + company.name);

            await page.$eval(rowID + ' td:nth-child(1)', button => button.click() );
            await page.waitForSelector('body > div:nth-child(3) > table:nth-child(4) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > table:nth-child(1)');

            companies.push(company);
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

            let results = await getDetails(page, company);

            consejeres.push(...results.persons);
            memberships.push(...results.memberships);

            await page.goBack();
            await page.goBack();

            if( (i+1) == currentPage * resultsPerPage ) { // Ir a siguiente página
                await page.waitFor(3000); // Esperar para que no de error
                currentPage++;
                await page.$eval('#GridResultados_footer > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(5) > img:nth-child(1)', button => button.click() );
                console.log('Processing page ' + currentPage);
            }
        }

        await browser.close();

        return {
            companies: companies,
            persons: consejeres,
            memberships: memberships
        }
    }
    catch (err) {
        console.log(err);
        await browser.close();
        return { status: 'error', results: err };
    }
}

async function getRowData(rowID, page) {
    return page.$$eval(rowID + ' td', tds => tds.map((td, j) => {
        return td.textContent.trim();
    }));
}

function getMatches(string, regex, index) {
    index || (index = 1); // default to the first capturing group
    var matches = [];
    var match;
    while (match = regex.exec(string)) {
        matches.push(match[index]);
    }
    return matches;
}

function buildCompany(row) {
    let company = {
        id: laundry.simpleName(laundry.launder(row[0])),
        name: row[0],
        classification: 'company',
        area: [{
            id: 'cr',
            name: 'CR',
            classification: 'country'
        }]
    }

    return company;
}

async function getDetails(page, company) {
    try {
        await page.waitFor(2000);
        const url = await page.url();
        company.links = [];
        company.links.push({
            id: url
        });

        let table = await page.$$eval('body > div:nth-child(3) > table:nth-child(4) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > table:nth-child(1) td', tds => tds.map(td => { return td.textContent.trim() }));
        let moreInfoSelector = 'body > div:nth-child(3) > table:nth-child(3) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(1) > table:nth-child(2) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(2) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(2) > a:nth-child(1)';
        await page.$eval(moreInfoSelector, button => button.click() );
        await page.waitFor(2000);
        await page.waitForSelector('body > div:nth-child(2) > table:nth-child(3) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > table:nth-child(1)');
        let table2 = await page.$$eval('body > div:nth-child(2) > table:nth-child(3) > tbody:nth-child(1) > tr:nth-child(2) > td:nth-child(1) > table:nth-child(1)', tds => tds.map(td => { return td.textContent.trim() }));

        let tables = [];
        tables.push(...table);
        tables.push(...table2);
        processTables(company, tables);
        await page.waitForSelector('td.grid_header');

        let consejeresTable = await page.$$eval('body > div > table', tables => tables.map((table, k) => {
            let validTable = table.querySelector('tbody > tr > td.grid_header');
            if(validTable && validTable.textContent.trim() == 'Estructura Organizativa') {
                const subTable = table.querySelector('table');
                const trs = [...subTable.getElementsByTagName('tr')];
                return trs.map((tr, j) => {
                    if(j == 0) return null; // Saltar la primera fila
                    const tds = [...tr.getElementsByTagName('td')];
                    return tds.map((td, i) => {
                        return td.textContent.trim();
                    });
                });
            }
        }));
        // console.log(consejeresTable);
        let results = processConsejeres(company, consejeresTable.filter(row => row != null));

        return {
            persons: results[0],
            memberships: results[1]
        }
    }
    catch(e) {
        console.log(e);
        return {
            persons: [],
            memberships: []
        }
    }
}

function processTables(company, table) {
    for(let i=0; i<table.length; i++) {
        i++;
        switch(table[i-1]) {
            case 'Nombre Comercial':
                let nombre_comercial = table[i];
                if(nombre_comercial != company.name) {
                    company.other_names = [];
                    company.other_names.push(nombre_comercial);
                }
                break;
            case 'Cédula Jurídica':
                if(!company.hasOwnProperty('identifiers')) company.identifiers = [];
                company.identifiers.push({
                    identifier: table[i],
                    scheme: 'Cédula Jurídica'
                });
                break;
            case 'Teléfono':
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "voice",
                    "label": "Primary telephone number",
                    "value": table[i]
                });
                break;
            case 'Fax':
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "voice",
                    "label": "Fax telephone number",
                    "value": table[i]
                });
                break;
            case 'Correo electrónico':
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "email",
                    "label": "Primary email address",
                    "value": table[i]
                });
                break;
            case 'Sitio WEB':
                company.links.push({id:table[i]});
                break;
            case 'Dirección':
                if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                company.contact_details.push({
                    "type": "office",
                    "label": "Primary address",
                    "value": table[i]
                });
                break;
            case 'Tipo Actividad':
                company.subclassification = table[i];
                break;
            case 'Actividad Principal':
                company.abstract = table[i];
                break;
            case 'Fecha de Constitución':
                company.founding_date = table[i];
                break;
        }
    }
}

function processConsejeres(company, consejeresTable) {
    let consejeres = [];
    let memberships = [];

    consejeresTable[0].map( (row) => {
        if(row == null) return;

        let consejereID = laundry.simpleName(laundry.launder(row[0]));
        let consejere = {
            id: consejereID,
            name: row[0],
            area: [{
                id: 'cr',
                name: 'CR',
                classification: 'country'
            }]
        }
        if(row[1]) {
            consejere.identifiers = [];
            consejere.identifiers.push({
                identifier: row[1],
                scheme: 'Cédula Jurídica'
            });
        }
        consejeres.push(consejere);

        let memberID = company.id + '_' + consejereID + '-bm';
        let membership = {
            id: memberID,
            role: "Boardmember",
            organization_id: company.id,
            organization_name: company.name,
            organization_class: "company",
            parent_id: laundry.simpleName(laundry.launder(row[0])),
            parent_name: row[0],
            parent_class: "person",
            title: row[2]
        }
        if(row[3]) membership.end_date = row[3];
        memberships.push(membership);

        // Memberships de persona a bolsa
        let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
        let personStockMembership = {
            id: personStockMemberID,
            role: "Consejero de Emisor de Acciones",
            person_id: consejereID,
            person_name: row[0],
            parent_id: laundry.simpleName(laundry.launder(bolsa)),
            parent_name: bolsa,
            parent_class: "company",
            parent_subclass: "stock-exchange"
        }
        memberships.push(personStockMembership);
    } );

    return [consejeres, memberships];
}

module.exports = { getList, getDetails }
