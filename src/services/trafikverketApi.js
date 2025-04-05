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
        <INCLUDE>
          GID
        </INCLUDE>
        <EVAL alias="Närmaste länk" function="$function.vägdata_v1.SnapToRoadNetwork(${x}, ${y}, MaxDistance=500)" />
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Skickar nätanknytnings-anrop till Trafikverket med koordinater: E=${x}, N=${y}`);
    console.log('XML-förfrågan:', requestXml);
    
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
    console.log('Fick svar från API:', JSON.stringify(data, null, 2));
    
    // Spara råa svaret för debugging
    const result = parseSnapToRoadData(data);
    result.rawResponse = data;

    // Om vi fick element_ID från första anropet, gör ytterligare anrop för att hämta väginformation
    if (result.evalResults && result.evalResults['Närmaste länk'] && result.evalResults['Närmaste länk'].Element_Id) {
      try {
        const elementId = result.evalResults['Närmaste länk'].Element_Id;
        
        // Parallellisera API-anrop för olika vägegenskaper för bättre prestanda
        const [
          roadDetails, 
          hastighetDetails, 
          väghållareDetails, 
          vägbreddDetails
        ] = await Promise.all([
          getGatuNamnFrånElementId(elementId),
          getHastighetFrånElementId(elementId),
          getVäghållareFrånElementId(elementId),
          getVägbreddFrånElementId(elementId)
        ]);
        
        // Lägg till detaljerad information till resultatet
        result.roadDetails = roadDetails;
        result.hastighetDetails = hastighetDetails;
        result.väghållareDetails = väghållareDetails;
        result.vägbreddDetails = vägbreddDetails;
      } catch (detailsError) {
        console.error('Kunde inte hämta detaljerad väginformation:', detailsError);
        result.roadDetailsError = detailsError.message;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Fel vid API-anrop till Trafikverket:', error);
    throw error;
  }
}

/**
 * Hämtar detaljerad gatinformation baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad vägdata
 */
export async function getGatuNamnFrånElementId(elementId) {
  // Skapa XML-förfrågan enligt Trafikverkets format
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Gatunamn" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Namn</INCLUDE>
        <INCLUDE>Geometry.WKT-SWEREF99TM-3D</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar gatunamn för element ID: ${elementId}`);
    console.log('XML-förfrågan:', requestXml);
    
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
    console.log('Fick svar från API (gatunamn):', JSON.stringify(data, null, 2));
    
    // Om vi inte hittar Gata, försök med Funktionell vägklass
    if (!data?.RESPONSE?.RESULT?.[0]?.Gata || data.RESPONSE.RESULT[0].Gata.length === 0) {
      return await getFunktionellVägklassFrånElementId(elementId);
    }
    
    return parseGatuData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för gatunamn:', error);
    
    // Fallback till att hämta funktionell vägklass om gatunamn misslyckas
    try {
      return await getFunktionellVägklassFrånElementId(elementId);
    } catch (fallbackError) {
      console.error('Fallback till funktionell vägklass misslyckades:', fallbackError);
      throw error; // Kasta ursprungliga felet om fallback också misslyckas
    }
  }
}

/**
 * Hämtar hastighetsbegränsning baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad data om hastighetsbegränsning
 */
export async function getHastighetFrånElementId(elementId) {
  // Skapa XML-förfrågan för hastighetsbegränsning
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Hastighetsgräns" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Högsta_tillåtna_hastighet</INCLUDE>
        <INCLUDE>Geometry.WKT-SWEREF99TM-3D</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar hastighetsbegränsning för element ID: ${elementId}`);
    console.log('XML-förfrågan:', requestXml);
    
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
    console.log('Fick svar från API (hastighetsbegränsning):', JSON.stringify(data, null, 2));
    
    return parseHastighetData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för hastighetsbegränsning:', error);
    return { 
      success: false,
      dataType: 'hastighet',
      error: 'Kunde inte hämta hastighetsbegränsning',
      message: error.message
    };
  }
}

/**
 * Hämtar väghållare baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad data om väghållare
 */
export async function getVäghållareFrånElementId(elementId) {
  // Skapa XML-förfrågan för väghållare
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Väghållare" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Väghållarnamn</INCLUDE>
        <INCLUDE>Väghållartyp</INCLUDE>
        <INCLUDE>Geometry.WKT-SWEREF99TM-3D</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar väghållare för element ID: ${elementId}`);
    console.log('XML-förfrågan:', requestXml);
    
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
    console.log('Fick svar från API (väghållare):', JSON.stringify(data, null, 2));
    
    return parseVäghållareData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för väghållare:', error);
    return { 
      success: false,
      dataType: 'väghållare',
      error: 'Kunde inte hämta väghållare',
      message: error.message
    };
  }
}

/**
 * Hämtar vägbredd baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad data om vägbredd
 */
export async function getVägbreddFrånElementId(elementId) {
  // Skapa XML-förfrågan för vägbredd
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Vägbredd" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Bredd</INCLUDE>
        <INCLUDE>Geometry.WKT-SWEREF99TM-3D</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar vägbredd för element ID: ${elementId}`);
    console.log('XML-förfrågan:', requestXml);
    
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
    console.log('Fick svar från API (vägbredd):', JSON.stringify(data, null, 2));
    
    return parseVägbreddData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för vägbredd:', error);
    return { 
      success: false,
      dataType: 'vägbredd',
      error: 'Kunde inte hämta vägbredd',
      message: error.message
    };
  }
}

/**
 * Hämtar funktionell vägklass baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad vägdata med funktionell vägklass
 */
async function getFunktionellVägklassFrånElementId(elementId) {
  // Skapa XML-förfrågan för funktionell vägklass
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="FunktionellVägklass" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Klass</INCLUDE>
        <INCLUDE>Geometry.WKT-SWEREF99TM-3D</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar funktionell vägklass för element ID: ${elementId}`);
    
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
      throw new Error(`API-anrop misslyckades: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Fick svar från API (funktionell vägklass):', JSON.stringify(data, null, 2));
    
    return parseFunktionellVägklassData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för funktionell vägklass:', error);
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
 * Parsar API-svaret för gatudata
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad gatudata
 */
function parseGatuData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0].Gata) {
      console.log('Inga gatudata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Inga gatudata hittades' 
      };
    }

    // Extrahera gatudata från svaret
    const gatudata = apiResponse.RESPONSE.RESULT[0].Gata || [];
    const formattedData = Array.isArray(gatudata) ? gatudata : [gatudata];
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'gata',
      data: formattedData,
      message: formattedData.length > 0 ? 
        `Hittade gatuinformation för ${formattedData.length} gator` : 
        'Inga gatudata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av gatudata:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för gatudata',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för funktionell vägklass
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för funktionell vägklass
 */
function parseFunktionellVägklassData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0]['Funktionell vägklass']) {
      console.log('Ingen data för funktionell vägklass hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen data för funktionell vägklass hittades' 
      };
    }

    // Extrahera data från svaret
    const vägklassData = apiResponse.RESPONSE.RESULT[0]['Funktionell vägklass'] || [];
    const formattedData = Array.isArray(vägklassData) ? vägklassData : [vägklassData];
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'funktionellVägklass',
      data: formattedData,
      message: formattedData.length > 0 ? 
        `Hittade data för funktionell vägklass` : 
        'Ingen data för funktionell vägklass hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av data för funktionell vägklass:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för funktionell vägklass',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för hastighetsbegränsning
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för hastighetsbegränsning
 */
function parseHastighetData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0]['Hastighetsgräns']) {
      console.log('Ingen data för hastighetsbegränsning hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen data för hastighetsbegränsning hittades' 
      };
    }

    // Extrahera data från svaret
    const hastighetData = apiResponse.RESPONSE.RESULT[0]['Hastighetsgräns'] || [];
    const formattedData = Array.isArray(hastighetData) ? hastighetData : [hastighetData];
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'hastighet',
      data: formattedData,
      message: formattedData.length > 0 ? 
        `Hittade hastighetsbegränsning: ${formattedData[0].Värde || 'N/A'} km/h` : 
        'Ingen data för hastighetsbegränsning hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av hastighetsbegränsning:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för hastighetsbegränsning',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för väghållare
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för väghållare
 */
function parseVäghållareData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0]['Väghållare']) {
      console.log('Ingen data för väghållare hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen data för väghållare hittades' 
      };
    }

    // Extrahera data från svaret
    const väghållareData = apiResponse.RESPONSE.RESULT[0]['Väghållare'] || [];
    const formattedData = Array.isArray(väghållareData) ? väghållareData : [väghållareData];
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'väghållare',
      data: formattedData,
      message: formattedData.length > 0 ? 
        `Hittade väghållare: ${formattedData[0].Väghållartyp || 'Okänd'}` : 
        'Ingen data för väghållare hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av väghållare:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för väghållare',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för vägbredd
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för vägbredd
 */
function parseVägbreddData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0 ||
        !apiResponse.RESPONSE.RESULT[0]['Vägbredd']) {
      console.log('Ingen data för vägbredd hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen data för vägbredd hittades' 
      };
    }

    // Extrahera data från svaret
    const vägbreddData = apiResponse.RESPONSE.RESULT[0]['Vägbredd'] || [];
    const formattedData = Array.isArray(vägbreddData) ? vägbreddData : [vägbreddData];
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'vägbredd',
      data: formattedData,
      message: formattedData.length > 0 ? 
        `Hittade vägbredd: ${formattedData[0].Bredd || 'N/A'} meter` : 
        'Ingen data för vägbredd hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av vägbredd:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för vägbredd',
      rawData: apiResponse 
    };
  }
}

/**
 * Hämtar vägdata inom en bbox runt en given koordinat i SWEREF99TM
 * @param {number} x - X-koordinat i SWEREF99TM (Easting)
 * @param {number} y - Y-koordinat i SWEREF99TM (Northing)
 * @returns {Promise<Object>} - Vägdata för området
 */
export async function getVägdataFrånKoordinat(x, y) {
  try {
    // Använd resultat från getNärmasteVäg som redan innehåller gatunamn
    const närmasteVägResult = await getNärmasteVäg(x, y);
    
    if (närmasteVägResult.success && 
       (närmasteVägResult.roadDetails || 
        närmasteVägResult.hastighetDetails || 
        närmasteVägResult.väghållareDetails || 
        närmasteVägResult.vägbreddDetails)) {
      
      // Samla all information i ett ställe
      const vägInfo = {
        gatunamn: närmasteVägResult.roadDetails?.data || [],
        hastighet: närmasteVägResult.hastighetDetails?.data || [],
        väghållare: närmasteVägResult.väghållareDetails?.data || [],
        vägbredd: närmasteVägResult.vägbreddDetails?.data || []
      };
      
      return {
        success: true,
        method: 'element_id',
        data: vägInfo,
        elementId: närmasteVägResult.evalResults?.['Närmaste länk']?.Element_Id,
        message: `Hittade vägdata via element_ID: ${närmasteVägResult.evalResults?.['Närmaste länk']?.Element_Id}`,
        rawResult: närmasteVägResult
      };
    } else {
      return {
        success: false,
        method: 'element_id',
        message: 'Kunde inte hitta vägdata via element_ID',
        error: 'Ingen vägdata hittades för denna position'
      };
    }
  } catch (error) {
    console.error('Fel vid hämtning av vägdata:', error);
    return { 
      success: false,
      error: `Kunde inte hämta vägdata: ${error.message}`,
      message: 'Ett fel uppstod vid hämtning av vägdata'
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