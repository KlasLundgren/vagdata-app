/**
 * Service för att kommunicera med Trafikverkets API
 */

// Bas-URL för Trafikverkets API
const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// API-nyckel från Trafikverket
const API_KEY = '04f311489cce45c993f721911c767bec'; 

/**
 * Hämtar vägdata inom en bbox runt en given koordinat i SWEREF99TM
 * @param {number} x - X-koordinat i SWEREF99TM (Easting)
 * @param {number} y - Y-koordinat i SWEREF99TM (Northing)
 * @returns {Promise<Object>} - Vägdata för området
 */
export async function getVägdataFrånKoordinat(x, y) {
  // Skapa en area runt den angivna punkten (100 meter i varje riktning)
  const x1 = x - 100;
  const y1 = y - 100;
  const x2 = x + 100;
  const y2 = y + 100;

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
 * Parsar API-svaret till ett mer användarvänligt format
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