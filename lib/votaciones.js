let axios = require('axios');
let cheerio = require('cheerio');

async function getVotaciones(id_sesion) {
    let votacionesURL = encodeURI('http://stats.congreso.gob.gt/hemiciclo/graphs/v_container.asp?fses=' + id_sesion);
    console.log('Getting votaciones for session ID ' + id_sesion);

    try {
        const response = await axios.get(votacionesURL);
        console.log('Got response');
        if(response.status === 200) {
            const html = response.data;
            const $ = cheerio.load(html);
            let votaciones = await processVotaciones(id_sesion, $);
            return votaciones;
        }
        else {
            console.log('Error: status ' + response.status);
            return false;
        }
    } 
    catch (error) {
        console.log('Error: ' + error);
        return false;
    }
}

async function processVotaciones(id_sesion, $) {
    let votaciones = [];
    console.log('Processing votaciones...');
    $('tr.v2_txt_small').each( (i, elem) => {
        let cells = [];
        elem.children.map( (child) => {
            if(child.type == 'tag' && child.name == 'td') {
                cells.push(child);
            }
        } );

        let link = cells[0].children[0].attribs.href;
        let title = cells[0].children[0].children[0].data;
        let votos_favor = cells[1].children[0].data;
        let votos_contra = cells[2].children[0].data;
        let votos_ausente = cells[3].children[0].data;
        
        // Obtener id de la votación...
        let link_parts = link.split('&');
        let id_part = link_parts.filter( (part) => part.indexOf('feve') >= 0 );
        let id = id_part[0].replace('feve=', '');
        
        // Obtener fecha de la votación
        let title_parts = title.split('-');
        let date = title_parts[0];
        
        let votacion = {
            id: id,
            id_sesion: id_sesion,
            title: title,
            url: link,
            date: date,
            votos_favor: votos_favor,
            votos_contra: votos_contra,
            votos_ausente: votos_ausente,
            votos: []
        }
        
        votaciones.push(votacion);
    } );
    
    // Ordenar las votaciones por fecha...
    
    return votaciones;
}

module.exports = { getVotaciones, processVotaciones }