/**
 * Service för att kommunicera med Trafikverkets API
 */

// Bas-URL för Trafikverkets API
const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// API-nyckel från Trafikverket - uppdaterad med din nyckel
const API_KEY = '808cbb28635742ba98e00c9beaa95956'; 

/**
 * Använder nätanknytningsfunktionen för att hitta närmaste väg
 * @param {number} x - X-koordinat i SWEREF99TM (Easting)
 * @param {number} y - Y-koordinat i SWEREF99TM (Northing)
 * @returns {Promise<Object>} - Vägdata för närmaste väg
 */
export async function getNärmasteVäg(x, y) {
  // Använd den förfrågan som fungerade i testbänken
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}"/>
      <QUERY objecttype="Vägnummer" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <EVAL alias="Närmaste länk" function="$function.vägdata_v1.SnapToRoadNetwork(${x}, ${y})" />
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log('Skickar nätanknytnings-anrop till Trafikverket:', requestXml);
    
    // Skicka POST-förfrågan till Trafikverkets API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Accept': 'application/json'
      },
      body: requestXml
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API svarade med felkod:', response.status, errorText);
      throw new Error(`API-anrop misslyckades: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Fick svar från API:', data);
    return parseSnapToRoadData(data);
  } catch (error) {
    console.error('Fel vid API-anrop till Trafikverket:', error);
    throw error;
  }
}

/**
 * Hämtar vägdata inom en bbox runt en given koordinat i SWEREF99TM
 * @param {number} x - X-koordinat i SWEREF99TM (Easting)
 * @param {number} y - Y-koordinat i SWEREF99TM (Northing)
 * @returns {Promise<Object>} - Vägdata för området
 */
export async function getVägdataFrånKoordinat(x, y) {
  // Skapa en area runt den angivna punkten (500 meter i varje riktning)
  const x1 = x - 500;
  const y1 = y - 500;
  const x2 = x + 500;
  const y2 = y + 500;

  // Skapa XML-förfrågan enligt Trafikverkets format
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Vägnummer" namespace="vägdata.nvdb_dk_o" schemaversion="1.2">
        <FILTER>
          <WITHIN name="Geometry.WKT-SWEREF99TM-3D" shape="box" value="${x1} ${y1}, ${x2} ${y2}"/>
        </FILTER>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log('Skickar API-anrop till Trafikverket:', requestXml);
    
    // Skicka POST-förfrågan till Trafikverkets API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Accept': 'application/json'
      },
      body: requestXml
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API svarade med felkod:', response.status, errorText);
      throw new Error(`API-anrop misslyckades: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Fick svar från API:', data);
    return parseVägdata(data);
  } catch (error) {
    console.error('Fel vid API-anrop till Trafikverket:', error);
    throw error;
  }
}

/**
 * Parsar API-svaret från nätanknytningsfunktionen
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad vägdata från nätanknytningen
 */
function parseSnapToRoadData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0].INFO ||
        !apiResponse.RESPONSE.RESULT[0].INFO.EVALRESULT) {
      console.log('Inga nätanknytningsdata hittades i svaret');
      return { 
        success: true, 
        data: null,
        evalResults: [],
        message: 'Inga nätanknytningsresultat hittades' 
      };
    }

    // Extrahera grundläggande vägdata
    const vägdata = apiResponse.RESPONSE.RESULT[0].Vägnummer || [];
    
    // Extrahera utvärderingsresultat (från nätanknytningsfunktionen)
    const evalResults = apiResponse.RESPONSE.RESULT[0].INFO.EVALRESULT;
    
    // Samla ihop nätanknytningsdata
    const roadLinkData = {};
    
    evalResults.forEach(result => {
      const key = Object.keys(result)[0];
      roadLinkData[key] = result[key];
    });
    
    return {
      success: true,
      data: Array.isArray(vägdata) ? vägdata : [vägdata],
      evalResults: roadLinkData,
      message: Object.keys(roadLinkData).length > 0 ? 
        'Nätanknytning lyckades' : 'Inga nätanknytningsresultat hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av nätanknytningsdata:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för att hitta vägnummer och väginformation
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad vägdata
 */
function parseVägdata(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Inga vägdata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Inga vägdata hittades för denna position' 
      };
    }

    // Extrahera vägdata från svaret
    const vägdata = apiResponse.RESPONSE.RESULT[0].Vägnummer || [];
    
    // Returnera formaterad data
    return {
      success: true,
      data: Array.isArray(vägdata) ? vägdata : [vägdata],
      message: vägdata.length > 0 ? `Hittade ${vägdata.length} vägar` : 'Inga vägdata hittades för denna position'
    };
  } catch (error) {
    console.error('Fel vid parsning av vägdata:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket',
      rawData: apiResponse 
    };
  }
}