const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Bolsa Institucional de Valores';

async function getList() {
    const listURL = 'https://www.biva.mx/en/web/portal-biva/profile';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'load', timeout:0 });
        await page.waitForSelector('#data-table_length > label:nth-child(1) > select:nth-child(1)');

        await page.select('#data-table_length > label:nth-child(1) > select:nth-child(1)', '100');
        await page.waitForSelector('tr.even:nth-child(100)', { timeout:0 });

        let allTables = [];
        // Procesar la primera página antes de seguir los links de paginación
        console.log('Getting page 1');
        let table = await getPage(page);
        allTables.push(...table);

        let pagination = await page.$$('#data-table_paginate span a.paginate_button');
        let numPages = pagination.length;

        for(let i=1; i<numPages; i++) {
            console.log('Getting page ' + (i+1));
            await pagination[i].click();
            await page.waitFor(5000); // Hack, porque no está resuelto el caso de esperar a que el DOM cargue de nuevo después de un request (https://github.com/puppeteer/puppeteer/issues/4724)
            table = await getPage(page);
            allTables.push(...table);

            // Obtener la paginación de nuevo porque se pierde el contexto al hacer click...
            pagination = await page.$$('#data-table_paginate span a.paginate_button');
        }

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name: 'BIVA'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'mx',
                name: 'MX',
                classification: "country"
            }],
            links: [{id: 'https://www.biva.mx'}]
        }
        companies.push(bolsaCompany);

        allTables.map( (item) => {
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

async function getPage(browserPage) {
    return browserPage.$$eval('#data-table tbody tr', trs => trs.map((tr, j) => {
        const tds = [...tr.getElementsByTagName('td')];
        return tds.map((td, i) => {
            switch(i) {
                case 0:
                    return td.querySelector('a').textContent.trim();
                case 1:
                    return td.querySelector('span').textContent.trim();
            }
        });
    }));
}

function buildCompany(row) {
    let nombre = row[1];
    let url = 'https://www.biva.mx/en/web/portal-biva/company-information?clave=' + row[0];
    let siglas = row[0];

    let company = {
        id: laundry.simpleName(laundry.launder(nombre)),
        name: nombre,
        classification: 'company',
        identifiers: [{
            identifier: siglas,
            scheme: 'BIVA'
        }],
        area: [{
            id: 'mx',
            name: 'MX',
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
        await page.goto(companyURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('#pill-2');

        let data = await page.$eval('#pill-2', div => {
            let name = div.querySelector('span.issuer-name').textContent.trim();
            let website = div.querySelector('a.issuer-url').getAttribute('href');
            let address = div.querySelector('span.issuer-address').textContent.trim();
            let telephone = div.querySelector('span.issuer-telephone').textContent.trim();
            let sector = Array.from(div.querySelectorAll('span.issuer-sector')).map( span => { return span.textContent.trim() } );
            return [ name, website, address, telephone, sector.join(', ') ];
        } );

        if(data[1]) company.links.push({id: data[1]});
        if(data[2]) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "office",
                "label": "Primary address",
                "value": data[2]
            });
        }
        if(data[3]) {
            if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
            company.contact_details.push({
                "type": "voice",
                "label": "Primary telephone number",
                "value": data[3]
            });
        }
        if(data[4]) company.subclassification = data[4];

        await page.$eval('span.issuer-officers a', link => link.click());
        await page.waitForSelector('#modal-officers');

        let officers = await page.$$eval('#modal-officers table.counselors-table tr', trs => trs.map((tr, j) => {
            if(j == 0) return null;
            const tds = [...tr.getElementsByTagName('td')];
            return tds.map(td => { return td.textContent.trim() })
        }));

        if(officers.length > 0) {
            let content = processContent(officers, company);
            consejeres = content.persons;
            memberships = content.memberships;
        }

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
        if(row.length < 2) return;
        if(row[0] == '') return;
        if(row[0] == ',') return;

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
            title: row[1]
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
    console.log(consejeres.length + ' consejeres found...');
    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
