let axios = require('axios');
let cheerio = require('cheerio');
const puppeteer = require("puppeteer");
const laundry = require('company-laundry');

const bolsa = 'Bolsa de Comercio de Buenos Aires';
const validTitles = [
    'Consejero Secretario',
    'Consejero Vocal Titular',
    'Consejero Vocal Titular.',
    'Consejero Vocal Suplente',
    'Consejero Vocal Suplente.',
    'Consejo De Vigilancia Suplente',
    'Consejo De Vigilancia Titular',
    'Director No Ejecutivo',
    'Director Secretario',
    'Director Secretario.M.',
    'Director Suplente',
    'Director Suplente.',
    'Director Tesorero',
    'Director Tesorero.',
    'Director Titular',
    'Director Titular.',
    'Miebro Organo De Fiscalizacion',
    'Pres. De Consejo De Vigilancia',
    'Presidente Comis.Fiscalizadora',
    'Presidente Suplente',
    'Presidente',
    'Pro Tesorero',
    'Prosecretario',
    'Pte. Del Consejo De Administ.',
    'Representante Leg.En Argentina',
    'Sindico Suplente',
    'Sindico Suplente.',
    'Sindico Titular',
    'Sindico Titular.',
    'Vicepresidente 1°',
    'Vicepresidente 2°',
    'Vicep. Consejo De Administ.',
    'Vicepresidente Ejecutivo',
    'Vicepresidente Ejecutivo *',
    'Vicepresidente'
];

async function getList() {
    const listURL = 'https://www.bolsar.com/Vistas/Sociedades/BusquedaFichaTecnica.aspx';
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#ctl00_ctl00_ContentPlaceHolder1_GrillaListado_dataGridListado_ctl14_cboPages');
        await page.select('#ctl00_ctl00_ContentPlaceHolder1_GrillaListado_dataGridListado_ctl14_cboPages', '100');
        await page.waitForSelector('tr.filaVerde:nth-child(101)', { timeout:0 });
        await page.waitForSelector('#ctl00_ctl00_ContentPlaceHolder1_GrillaListado_dataGridListado', { timeout:0 });

        let allTables = [];
        // Procesar la primera página antes de seguir los links de paginación
        console.log('Getting page 1');
        let table = await getPage(page);
        allTables.push(...table)

        let pagination = await page.$$('.paginador > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(2) > a');
        let numPages = pagination.length;

        for(let i=0; i<numPages; i++) {
            console.log('Getting page ' + (i+2)); // Empieza en 0, ya procesamos la 1, i+2 es la página 2
            await pagination[i].click();
            await page.waitFor(15000); // Hack, porque no está resuelto el caso de esperar a que el DOM cargue de nuevo después de un request (https://github.com/puppeteer/puppeteer/issues/4724)
            table = await getPage(page);
            allTables.push(...table);

            // Obtener la paginación de nuevo porque se pierde el contexto al hacer click...
            pagination = await page.$$('.paginador > td:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(1) > td:nth-child(2) > a');
        }

        let companies = [];
        let bolsaCompany = {
            id: laundry.simpleName(laundry.launder(bolsa)),
            name: bolsa,
            other_names: [{name:'BOLSAR'}],
            classification: 'company',
            subclassification: 'stock-exchange',
            area: [{
                id: 'ar',
                name: 'AR',
                classification: 'country'
            }],
            links: [{id:'https://www.bolsar.com'}]
        }
        companies.push(bolsaCompany);

        allTables.map( (row) => {
            companies.push( buildCompany(row) );
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
    return browserPage.$$eval('tr.filaFiltroPanelPrincipal,tr.filaVerde', trs => trs.map((tr, j) => {
        const tds = [...tr.getElementsByTagName('td')];
        return tds.map((td, i) => {
            switch(i) {
                case 1:
                    let nombre = td.textContent.trim();
                    let url = td.querySelector('a').getAttribute('href');
                    let id = url.split('EmiID=')[1];
                    return { nombre, url, id };
                case 0:
                case 2:
                case 3:
                    return td.textContent.trim();
            }
        });
    }));
}

function buildCompany(row) {
    let initials = row[0];
    let url = 'https://www.bolsar.com/Vistas/Sociedades/' + row[1].url;
    let id = row[1].id;
    let name = row[1].nombre;
    let activity = row[2];
    let type = row[3];

    let company = {
        id: laundry.simpleName(laundry.launder(name)),
        name: name,
        classification: 'company',
        subclassification: type,
        activity: activity,
        area: [{
            id: 'ar',
            name: 'AR',
            classification: 'country'
        }],
        identifiers: [{
            identifier: initials,
            scheme: 'BOLSAR'
        }],
        links: [ { id: 'https://www.bolsar.com/Vistas/Sociedades/FichaTecnicaSociedadesDetalle.aspx?EmiID=' + id } ]
    }

    return company;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;
    let response = null;

    try {
        response = await axios.get(companyURL);
    }
    catch (error) {
        console.log('ERROR:', error);
        return { status: 'error', results: error };
    }
    if(response.status === 200) {
        const html = response.data;
        const $ = cheerio.load(html);
        let entities = processCompany(company, $);
        return entities;
    }
    else {
        console.log('ERROR:', response.status);
        return { status: response.status, results: null };
    }
}

function processCompany(company, $) {
    let generalesSelector = '#ctl00_ContentPlaceHolder1_tdDatosGenerales';
    let autoridadesSelector = '#ctl00_ContentPlaceHolder1_tdAutoridadesEst';
    let adicionalesSelector = '#ctl00_ContentPlaceHolder1_divUltimosCargos';

    $(generalesSelector).each( (i, elem) => {
        let tepm_elem = null;

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trFechaConsti td')[1];
        if(temp_elem && temp_elem.children.length > 0) { company.founding_date = temp_elem.children[0].data.trim() }

        let address = {};
        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trCalle td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.street = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trPiso td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.number = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trLocalidad td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.city = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trCodPostal td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.postal_code = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trProv td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.state = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trPais td')[1];
        if(temp_elem && temp_elem.children.length > 0) { address.country = temp_elem.children[0].data.trim() }
        Object.assign(company, { address: address })

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trTelefonos td')[1];
        if(temp_elem && temp_elem.children.length > 0) { company.phone_number = temp_elem.children[0].data.trim() }

        temp_elem = $(elem).find('#ctl00_ContentPlaceHolder1_trWWW td')[1];
        if(temp_elem && temp_elem.children.length > 0) { company.website = temp_elem.children[0].data.trim() }
    } );

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

    $(autoridadesSelector).each( (i, elem) => {
        $(elem).find('#tblAutoridades td').each( (j, subelem) => {
            let info = extractInfo(subelem, company);
            consejeres.push(...info.consejeres);
            memberships.push(...info.memberships);
        } );
    } );

    $(adicionalesSelector).each( (i, elem) => {
        $(elem).find('#tblAutoridadesExtendida td').each( (j, subelem) => {
            let info = extractInfo(subelem, company);
            consejeres.push(...info.consejeres);
            memberships.push(...info.memberships);
        } );
    } );

    console.log('Found ' + consejeres.length + ' persons.');

    return {
        persons: consejeres,
        memberships: memberships
    };
}

function validTitle(title) {
    if(validTitles.indexOf(title) < 0) return false;
    else return true;
}

function separateParts(parts) {
    let newParts = [];
    let simpleParts = laundry.simpleName(parts);
    let found = false;

    validTitles.map( (title) => {
        if(!found) {
            let simpleTitle = laundry.simpleName(title);
            if(simpleParts.indexOf(simpleTitle) >= 0) {
                newParts[0] = title;
                newParts[1] = parts.replace(title, '').trim();
                found = true;
            }
        }
    } );
    return newParts;
}

function extractInfo(subelem, company) {
    let consejeres = [];
    let memberships = [];
    let parts = subelem.children[0].data.trim().split(/\s{2,}/);

    if(parts[1] == undefined) {
        parts = separateParts(subelem.children[0].data.trim());
    }

    if(laundry.isCompany(parts[1])) {
        console.log('ERROR: ' + parts[0] + ' - ' + parts[1] + ' is a company.');
    }
    else if(!validTitle(parts[0])) {
        // console.log('Skipping ' + parts);
    }
    else {
        let consejereName = parts[1];
        let consejereTitle = parts[0];
        if(parts.length > 2) {
            consejereName = parts.slice(1).join(' ');
        }
        let consejereID = laundry.simpleName(laundry.launder(consejereName));

        let consejere = {
            id: consejereID,
            name: consejereName,
            area: [{
                id: 'ar',
                name: 'AR',
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
            parent_name: consejereName,
            parent_class: "person",
            title: consejereTitle
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
    }

    return { consejeres: consejeres, memberships: memberships }
}

module.exports = { getList, getDetails }
