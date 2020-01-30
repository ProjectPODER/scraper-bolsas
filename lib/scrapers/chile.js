const puppeteer = require("puppeteer");
const laundry = require('company-laundry');
const bolsa = 'Comisión para el Mercado Financiero';

async function getList() {
    const listURL = 'http://www.cmfchile.cl/portal/principal/605/w3-propertyvalue-18490.html';
    let categories = null;
    let tempList = [];
    console.log('Getting list...');

    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(listURL, { waitUntil: 'networkidle0' });
        await page.waitForSelector('#lista_valores_i__w3_pa_MV_entidades_INDICE_1');

        categories = await page.$$eval('#lista_valores_i__w3_pa_MV_entidades_INDICE_1 ul li a', lis => lis.map(li => {
            return { categoria: li.textContent, url: 'http://www.cmfchile.cl/portal/principal/605/' + li.getAttribute('href') }
        }));
    }
    catch (err) {
        await browser.close();
        console.log(err);
        return { status: 'error', results: err };
    }

    // for(let i=27; i<30; i++) {
    for(let i=0; i<categories.length; i++) {
        switch(categories[i].categoria) {
            case 'Abogados Calificadores':
            case 'Fondos Mutuos':
            case 'Fondos de Inversión No Rescatables':
            case 'Fondos de Inversión Capital Extranjero (FICE)':
            case 'Fondos de Inversión Capital Extr. Riesgo':
            case 'Fondos de Inversión Rescatables':
            case 'Fondos para la Vivienda':
            case 'Valores Extranjeros':
                console.log('Skipping ' + categories[i].categoria);
                break;
            default:
                console.log('Processing category ' + categories[i].categoria);
                try {
                    await page.goto(categories[i].url, { waitUntil: 'networkidle2' });
                    await page.waitForSelector('#listado_fiscalizados table');
                    let list = await page.$$eval('#listado_fiscalizados table tr', trs => trs.map((tr, j) => {
                        if(j == 0) return null; // Saltar la primera fila
                        const tds = [...tr.getElementsByTagName('td')];
                        if(tds.length < 3) return null; // No procesar si indica que no hay información

                        return tds.map((td, i) => {
                            switch(i) {
                                case 0:
                                    let rut = td.textContent.trim();
                                    let url = 'http://www.cmfchile.cl' + td.querySelector('a').getAttribute('href');
                                    return { rut, url };
                                case 1:
                                    return td.querySelector('a').textContent.trim();
                            }
                        });
                    }));
                    tempList[categories[i].categoria] = [];
                    let count = 0;
                    list.map( (l) => {
                        if(l != null) {
                            count++;
                            tempList[categories[i].categoria].push(l);
                        }
                    } );
                    console.log('Found ' + count);
                }
                catch(err) { console.log(err) }
                break;
        }
    }

    let companies = [];
    let bolsaCompany = {
        id: laundry.simpleName(laundry.launder(bolsa)),
        name: bolsa,
        other_names: [{name:'CMF'}],
        classification: 'company',
        subclassification: 'stock-exchange',
        area: [{
            id: 'cl',
            name: 'CL',
            classification: 'country'
        }],
        links: [{id: 'http://www.cmfchile.cl'}]
    }
    companies.push(bolsaCompany);

    for(var cat in tempList) {
        for(let k=0; k<tempList[cat].length; k++) {
            var item = tempList[cat][k];
            if(item != null) {
                companies.push({
                    id: laundry.simpleName(laundry.launder(item[1])),
                    name: item[1],
                    classification: 'company',
                    subclassification: cat,
                    area: [{
                        id: 'cl',
                        name: 'CL',
                        classification: 'country'
                    }],
                    identifiers: [{
                        identifier: item[0].rut,
                        scheme: 'RUT'
                    }],
                    links: [ { id: item[0].url } ]
                });
            }
        }
    }

    await browser.close();
    return companies;
}

async function getDetails(company) {
    const companyURL = company.links[0].id
    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(companyURL, {waitUntil: 'load'});
        await page.waitForSelector('#contenido table');

        let companyData = await page.$$eval('#contenido table tbody tr', trs => trs.map((tr, j) => {
            const ths = [...tr.getElementsByTagName('th')];
            let keys = ths.map((th) => {
                return th.textContent.trim();
            });
            const tds = [...tr.getElementsByTagName('td')];
            let values = tds.map((td) => {
                return td.textContent.trim();
            });

            return { key: keys.join(''), value: values.join('') };
        }));

        companyData.map( (row) => {
            if(row.value != '') {
                switch(row.key) {
                    case 'Nombre Fantasía':
                    case 'Nombre de fantasía':
                    case 'Nombre con  que transa en la Bolsa':
                        if(!company.hasOwnProperty('other_names')) company.other_names = [];
                        company.other_names.push(row.value);
                        break;
                    case 'Tipo de compañía':
                    case 'Tipo de persona':
                    case 'Tipo de Fondo de Inversión:':
                        company.description = row.value;
                        break;
                    case 'Fecha de Inscripción':
                    case 'Fecha Inscripcion Reg. Valores':
                        company.founding_date = row.value;
                        break;
                    case 'Fax':
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "voice",
                            "label": "Fax number",
                            "value": row.value
                        });
                        break;
                    case 'Teléfono':
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "voice",
                            "label": "Primary telephone number",
                            "value": row.value
                        });
                        break;
                    case 'Domicilio':
                    case 'Domicilio particular':
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "office",
                            "label": "Primary address",
                            "value": row.value
                        });
                        break;
                    case 'Domicilio comercial':
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "office",
                            "label": "Business address",
                            "value": row.value
                        });
                        break;
                    case 'Ciudad':
                        company.area.push({
                            "name": row.value,
                            "classification": "city"
                        });
                        break;
                    case 'Región':
                        company.area.push({
                            "name": row.value,
                            "classification": "state"
                        });
                        break;
                    case 'Sitio web':
                        company.links.push({id:row.value})
                        break;
                    case 'E-mail':
                    case 'e-Mail':
                    case 'e-mail de contacto':
                        if(!company.hasOwnProperty('contact_details')) company.contact_details = [];
                        company.contact_details.push({
                            "type": "email",
                            "label": "Primary email address",
                            "value": row.value
                        });
                        break;
                }
            }
        } );

        await browser.close();
    }
    catch(e) {
        await browser.close();
        console.log('ERROR...', e);
        console.log(e.message);
    }

    let consejeresData = null;
    const consejeresURL = company.links[0].id.replace('pestania=1', 'pestania=46');
    try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.goto(consejeresURL, {waitUntil: 'load'});
        await page.waitForSelector('#contenido table');

        consejeresData = await page.$$eval('#contenido table tbody tr', trs => trs.map((tr, j) => {
            if(j == 0) return null; // Saltar la primera fila
            const tds = [...tr.getElementsByTagName('td')];
            if(tds.length < 3) return null; // No procesar si indica que no hay información

            return tds.map((td, i) => {
                return td.textContent.trim();
            });

        }));

        await browser.close();
    }
    catch(e) {
        await browser.close();
        console.log('ERROR...', e);
        console.log(e.message);
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

    if(consejeresData) {
        consejeresData.map( (c) => {
            if(c == null) return;

            let consejereID = laundry.simpleName(laundry.launder(c[1]));
            let consejere = {
                id: consejereID,
                name: c[1],
                area: [{
                    id: 'cl',
                    name: 'CL',
                    classification: "country"
                }],
                identifiers: [{
                    identifier: c[0],
                    scheme: "RUT"
                }]
            }
            consejeres.push(consejere);

            let memberID = laundry.simpleName(laundry.launder(company.id)) + '_' + consejereID + '-bm';
            let membership = {
                id: memberID,
                role: "Boardmember",
                organization_id: company.id,
                organization_name: company.name,
                organization_class: "company",
                parent_id: consejereID,
                parent_name: c[1],
                parent_class: "person",
                title: c[2],
                start_date: c[3]
            }
            memberships.push(membership);

            // Memberships de persona a bolsa
            let personStockMemberID = laundry.simpleName(laundry.launder(bolsa)) + '_' + consejereID + '-se';
            let personStockMembership = {
                id: personStockMemberID,
                role: "Consejero de Emisor de Acciones",
                person_id: consejereID,
                person_name: c[1],
                parent_id: laundry.simpleName(laundry.launder(bolsa)),
                parent_name: bolsa,
                parent_class: "company",
                parent_subclass: "stock-exchange"
            }
            memberships.push(personStockMembership);
        } );
    }

    return {
        persons: consejeres,
        memberships: memberships
    };
}

module.exports = { getList, getDetails }
