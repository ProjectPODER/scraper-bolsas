const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa Mexicana de Valores';

async function getList() {
    const listURL = 'https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('#btnSearch');

        await page.$eval('#btnSearch', button => button.click() );
        await page.waitForSelector('#boxResults');

        let allTables = [];

        let list = await page.$$eval('#boxResults table.tableGeneral tbody tr', trs => trs.map(tr => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map((td, i) => {
                switch(i) {
                    case 0:
                        let siglas = td.textContent;
                        let url = td.querySelector('a').getAttribute('href');
                        return { siglas, url };
                    case 1:
                        return td.textContent;
                }
            });
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name: 'BMV'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'mx',
                name: 'MX',
                classification: "country"
            }],
            links: [{id: 'https://www.bmv.com.mx'}]
        }
        companies.push(bolsaCompany);

        list.map( (item) => {
            companies.push( buildCompany(item) );
        } );

        await browser.close();
        return companies;
    }
    catch (err) {
        console.log(err);
        return { status: 'error', results: err };
    }
}

function buildCompany(row) {
    let nombre = row[1];
    let url = row[0].url;
    let siglas = row[0].siglas;

    let company = {
        id: laundry.simpleName(laundry.launder(nombre)),
        name: nombre,
        classification: 'company',
        identifiers: [{
            identifier: siglas,
            scheme: "BMV"
        }],
        area: [{
            id: 'mx',
            name: 'MX',
            classification: 'country'
        }],
        links: [ { id: 'https://www.bmv.com.mx' + url } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('div.descr-area table.info:nth-child(2)');

        let rows = await page.$$eval('div.descr-area table.info:nth-child(2) tr', trs => trs.map( (tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds[1].textContent;
        } ));

        rows.map((row,i) => {
            switch(i) {
                case 0:
                    if(row != '') company.founding_date = row;
                    break;
                case 3:
                    if(row != '' && row != 'N/A') {
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "voice",
                            "label": "Primary telephone number",
                            "value": row
                        });
                    }
                    break;
                case 4:
                    if(row != '') {
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "email",
                            "label": "Primary email address",
                            "value": row
                        });
                    }
                    break;
                case 5:
                    if(row != '') {
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "office",
                            "label": "Primary address",
                            "value": row
                        });
                    }
                    break;
                case 6:
                    if(row != '' && row != 'N/A') {
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "voice",
                            "label": "Fax number",
                            "value": row
                        });
                    }
                    break;
            }
        });

        rows = await page.$$eval('div.descr-area table.info:nth-child(4) tr', trs => trs.map( (tr, j) => {
            const tds = [...tr.getElementsByTagName('td')];
            return tds[1].textContent;
        } ));

        rows.map((row,i) => {
            switch(i) {
                case 0:
                    if(row != '') company.subclassification = row;
                    break;
                case 4:
                    if(row != '') company.abstract = row;
                    break;
                case 6:
                    if(row != '') company.description = row;
                    break;
            }
        });

        rows = await page.$$eval('li.active:nth-child(2) > div:nth-child(2) > div:nth-child(1) > table:nth-child(1) tr', trs => trs.map( (tr, j) => {
            if(j == 0) return null;
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map(td => { return td.textContent.trim() });
        } ));

        let consejeres = [];
        let memberships = [];

        let content = processContent(rows, company);
        consejeres = content.persons;
        memberships = content.memberships;

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

        await browser.close();

        return {
            persons: consejeres,
            memberships: memberships
        }
    }
    catch(e) {
        console.log(e);
        await browser.close();
        return {
            persons: [],
            memberships: []
        }
    }
}

function cleanName(string) {
    return string
            .replace(/^\w{2,}\.\s+/g, '')
            .replace(/^c\.?p\.?\s/i, '')
            .replace(/@/, '')
            .replace(/^lic\.?\s/i, '')
            .replace(/-/, '')
            .replace(/^sr\.?\s/i, '')
            .replace(/^don\s/i, '')
            .replace(/^doña\s/i, '')
            .replace(/ingeniero/i, '')
            .replace(/arquitecto/i, '')
            .replace(/contador publico/i, '')
            .replace(/actuario/i, '')
            .replace(/^ing\.?\s/i, '')
            .replace(/\s\./, '')
            .replace(/^\.\s/, '')
            .replace(/^señor/i, '')
            .trim();
}

function processContent(rows, company) {
    let consejeres = [];
    let memberships = [];

    rows.map(row => {
        if(row == null) return;
        let consejereName = cleanName(row[0]);
        let consejereID = laundry.simpleName(laundry.launder(consejereName));

        let consejere = {
            id: consejereID,
            name: consejereName,
            area: [{
                id: 'mx',
                name: 'MX',
                classification: 'country'
            }]
        }
        consejeres.push(consejere);

        // Membership de persona a empresa
        let memberID = company.id + '_' + consejereID + '-bm';
        let membership = {
            id: memberID,
            role: "Boardmember",
            organization_id: company.id,
            organization_name: company.name,
            organization_class: "company",
            parent_id: consejereID,
            parent_name: consejereName,
            parent_class: "person",
            title: row[1],
            type: row[2]
        }
        memberships.push(membership);

        // Memberships de persona a bolsa
        let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
        let personStockMembership = {
            id: personStockMemberID,
            role: "Consejero de Emisor de Acciones",
            person_id: consejereID,
            person_name: consejereName,
            parent_id: laundry.simpleName(laundry.launder(bolsa)),
            parent_name: bolsa,
            parent_class: "company",
            parent_subclass: "stock-exchange"
        }
        memberships.push(personStockMembership);
    });

    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
