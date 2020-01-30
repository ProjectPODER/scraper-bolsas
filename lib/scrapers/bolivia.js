const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const pdf2html = require('pdf2html');
const fs = require("fs");
const request = require("request-promise-native");
const bolsa = 'Bolsa Boliviana de Valores S.A.';

async function getList() {
    const listURL = 'https://www.bbv.com.bo/directorio-de-emisores1';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0', timeout: 0 });
        await page.waitForSelector('a.accordion-toggle');

        let list = await page.$$eval('table.TextosNOj a.ContenidoLink', as => as.map(a => {
            let name = a.textContent;
            let url = a.getAttribute('href');
            return { name, url }
        }));

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name:'BBV'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'bo',
                name: 'BO',
                classification: 'country'
            }],
            links: [{id: 'https://www.bbv.com.bo'}]
        }
        companies.push(bolsaCompany);

        list.map( (row) => {
            if(row.name.length > 5)
                companies.push( buildCompany(row) );
        } );

        await browser.close();
        return companies;
    }
    catch (err) {
        console.log(err);
        await browser.close();
        return { status: 'error', results: err };
    }
}

function buildCompany(row) {
    let url = '';
    if(row.url.match('https')) url = row.url;
    else url = 'https://www.bbv.com.bo' + row.url;

    let company = {
        id: laundry.simpleName(laundry.launder(row.name)),
        name: row.name,
        classification: 'company',
        area: [{
            id: 'bo',
            name: 'BO',
            classification: 'country'
        }],
        links: [ { id: url } ]
    }

    return company;
}

async function downloadPDF(pdfURL, outputFilename) {
    let pdfBuffer = await request.get({uri: pdfURL, encoding: null});
    console.log("Writing downloaded PDF file to " + outputFilename + "...");
    fs.writeFileSync(outputFilename, pdfBuffer);
}

async function getDetails(company) {
    const companyURL = company.links[0].id;
    let urlParts = companyURL.split('/');
    const filename = urlParts[urlParts.length - 1];

    try {
        if (!fs.existsSync('./pdfs/' + filename)) {
            await downloadPDF(companyURL, './pdfs/' + filename);
        }

        let pdfText = await execShellCommand('pdftotext ./pdfs/' + filename + ' -');
        let data = extractData(pdfText);
        let content = processContent(data, company);

        return {
            persons: content.persons,
            memberships: content.memberships
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

function execShellCommand(cmd) {
    const exec = require('child_process').exec;
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.warn(error);
            }
            resolve(stdout? stdout : stderr);
        });
    });
}

function extractData(text) {
    let templines = text.split('\n\n');
    let i = 0;
    let data = {};
    data.consejeres = [];
    data.telefonos = [];
    templines = templines.filter(l => l.length > 1);
    let lines = [];
    templines.map(l => {
        let line = l.split('\n');
        lines.push(...line);
    });

    while(i < lines.length) {
        switch(lines[i]) {
            case 'DIRECCION:':
                i++;
                data.direccion = lines[i];
                break;
            case 'WEBSITE:':
                i++;
                while(lines[i].length < 1) { i++; }
                while(i < lines.length && lines[i].length < 100) {
                    if(lines[i].match(/@/g)) data.email = lines[i];
                    else if(lines[i].match(/www/g)) data.website = lines[i];
                    else if(lines[i].match(/\d{5,}/)) data.telefonos.push(lines[i]);
                    i++;
                }
                data.descripcion = lines[i];
                break;
            case 'Actividad Economica:':
                i += 2;
                data.actividad = lines[i];
                break;
            case 'Miembros del Directorio':
                while(i < lines.length && !lines[i].match('Principales Ejecutivos')) {
                    i++;
                    if(lines[i]) {
                        let post = lines[i].split(' ');
                        switch(post[0]) {
                            case 'Presidente':
                            case 'Vicepresidente':
                            case 'Primer':
                            case 'Segundo':
                            case 'Tercer':
                            case 'Secretario':
                            case 'Secretaria':
                            case 'Director':
                            case 'Síndico':
                            case 'Tesorero':
                            case 'Vocal':
                            case 'Concejal':
                                data.consejeres.push({
                                    nombre: lines[i-1],
                                    puesto: lines[i]
                                });
                                break;
                        }
                    }
                }
                break;
        }
        i++;
    }

    return data;
}

function processContent(data, company) {
    if(data.direccion) {
        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
        company.contact_details.push({
            "type": "office",
            "label": "Primary address",
            "value": data.direccion
        });
    }
    if(data.actividad) {
        company.subclassification = data.actividad
    }
    if(data.email) {
        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
        company.contact_details.push({
            "type": "email",
            "label": "Primary email address",
            "value": data.email
        });
    }
    if(data.website) {
        company.links.push({id: data.website})
    }
    if(data.descripcion) {
        company.description = data.descripcion;
    }
    if(data.telefonos.length > 0) {
        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
        data.telefonos.map((t, i) => {
            let type = (i == 0)? "Primary telephone number" : "Fax number";
            company.contact_details.push({
                "type": "voice",
                "label": type,
                "value": t
            });
        })
    }

    let consejeres = [];
    let memberships = [];

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

    if(data.consejeres.length > 0) {
        data.consejeres.map(c => {
            let consejereID = laundry.simpleName(laundry.launder(c.nombre));
            let consejere = {
                id: consejereID,
                name: c.nombre,
                area: [{
                    id: 'bo',
                    name: 'BO',
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
                parent_id: laundry.launder(laundry.simpleName(c.nombre)),
                parent_name: c.nombre,
                parent_class: "person",
                title: c.puesto
            }
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: c.nombre,
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        });
    }

    return {
        persons: consejeres,
        memberships: memberships
    }
}

module.exports = { getList, getDetails }
