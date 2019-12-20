let axios = require('axios');
let cheerio = require('cheerio');

async function getList() {
    const listURL = 'https://www.bolsar.com/Vistas/Sociedades/BusquedaFichaTecnica.aspx';

    try {
        const response = await axios.get(listURL);
        if(response.status === 200) {
            const html = response.data;
            const $ = cheerio.load(html);
            let companies = processList($);
            return companies;
        }
        else {
            return { status: response.status, results: null };
        }
    }
    catch (error) {
        return { status: 'error', results: error };
    }
}

function processList($) {
    let companies = [];
    let selector = 'tr.filaFiltroPanelPrincipal,tr.filaVerde';

    $(selector).each( (i, elem) => {
        let cells = [];
        elem.children.map( (child) => {
            if(child.type == 'tag' && child.name == 'td') {
                cells.push(child);
            }
        } );

        let initials = cells[0].children[0].data;
        let url = cells[1].children[0].attribs.href;
        let id = url.split('EmiID=')[1];
        let name = cells[1].children[0].children[0].data;
        let activity = cells[2].children[0].data;
        let type = cells[3].children[0].data;

        let company = {
            id: id,
            name: name,
            classification: 'company',
            subclassification: type,
            activity: activity,
            area: [
                {
                    id: 'argentina',
                    name: 'Argentina',
                    classification: 'country'
                }
            ],
            identifiers: [
                {
                    identifier: initials,
                    scheme: 'BOLSAR'
                }
            ],
            links: [ { id: 'https://www.bolsar.com/Vistas/Sociedades/FichaTecnicaSociedadesDetalle.aspx?EmiID=' + id } ]
        }

        companies.push(company);
    } );

    return companies;
}

async function getDetails(company) {
    const companyURL = company.links[0].id;

    try {
        const response = await axios.get(companyURL);
        if(response.status === 200) {
            const html = response.data;
            const $ = cheerio.load(html);
            let entities = processCompany(company, $);
            return entities;
        }
        else {
            return { status: response.status, results: null };
        }
    }
    catch (error) {
        return { status: 'error', results: error };
    }

}

function processCompany(company, $) {
    let generalesSelector = '#ctl00_ContentPlaceHolder1_tdDatosGenerales';
    let autoridadesSelector = '#ctl00_ContentPlaceHolder1_tdAutoridadesEst';
    console.log('Processing ' + company.name);

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
    $(autoridadesSelector).each( (i, elem) => {
        $(elem).find('#tblAutoridades td').each( (j, subelem) => {
            let parts = subelem.children[0].data.trim().split(/\s{2,}/);
            let consejere = {
                name: parts[1],
                title: parts[0]
            }
            consejeres.push(consejere);
        } );
    } );

    return consejeres;
}

module.exports = { getList, getDetails }
