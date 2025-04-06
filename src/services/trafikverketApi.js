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
          gatuNamnData, 
          funktionellVägklassData,
          hastighetData, 
          väghållareData, 
          vägbreddData
        ] = await Promise.all([
          getGatuNamnFrånElementId(elementId),
          getFunktionellVägklassFrånElementId(elementId),
          getHastighetFrånElementId(elementId),
          getVäghållareFrånElementId(elementId),
          getVägbreddFrånElementId(elementId)
        ]);
        
        // Lägg till detaljerad information till resultatet
        result.gatuNamnDetails = gatuNamnData;
        result.funktionellVägklassDetails = funktionellVägklassData;
        result.hastighetDetails = hastighetData;
        result.väghållareDetails = väghållareData;
        result.vägbreddDetails = vägbreddData;

        console.log("API-svarsdetaljer:", {
          gatuNamn: gatuNamnData,
          funktionellVägklass: funktionellVägklassData,
          hastighet: hastighetData,
          väghållare: väghållareData,
          vägbredd: vägbreddData
        });
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
 * Hämtar gatunamn baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad data om gatunamn
 */
export async function getGatuNamnFrånElementId(elementId) {
  // Skapa XML-förfrågan för gatunamn
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="Gatunamn" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <EQ name="Element_Id" value="${elementId}"/>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Namn</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar gatunamn för element ID: ${elementId}`);
    
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
    
    return parseGatuNamnData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för gatunamn:', error);
    return { 
      success: false,
      dataType: 'gatunamn',
      error: 'Kunde inte hämta gatunamn',
      message: error.message
    };
  }
}

/**
 * Hämtar funktionell vägklass baserat på element_ID
 * @param {string} elementId - Element_ID för väglänken
 * @returns {Promise<Object>} - Detaljerad data om funktionell vägklass
 */
export async function getFunktionellVägklassFrånElementId(elementId) {
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
      const errorText = await response.text();
      console.error('API svarade med felkod:', response.status, errorText);
      throw new Error(`API-anrop misslyckades: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Fick svar från API (funktionell vägklass):', JSON.stringify(data, null, 2));
    
    return parseFunktionellVägklassData(data);
  } catch (error) {
    console.error('Fel vid API-anrop för funktionell vägklass:', error);
    return { 
      success: false,
      dataType: 'funktionellVägklass',
      error: 'Kunde inte hämta funktionell vägklass',
      message: error.message
    };
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
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar hastighetsbegränsning för element ID: ${elementId}`);
    
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
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar väghållare för element ID: ${elementId}`);
    
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
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar vägbredd för element ID: ${elementId}`);
    
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
 * Parsar API-svaret för gatunamn data
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för gatunamn
 */
function parseGatuNamnData(apiResponse) {
  try {
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Ingen gatunamnsdata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen gatunamnsdata hittades' 
      };
    }

    // Försök hämta Gatunamn från resultatet
    let gatunamnsData = [];
    
    // Kontrollera de olika möjliga platser där gatunamnsdata kan finnas
    if (apiResponse.RESPONSE.RESULT[0].Gatunamn) {
      gatunamnsData = Array.isArray(apiResponse.RESPONSE.RESULT[0].Gatunamn) 
        ? apiResponse.RESPONSE.RESULT[0].Gatunamn 
        : [apiResponse.RESPONSE.RESULT[0].Gatunamn];
    }
    
    console.log("Parsed gatunamn data:", gatunamnsData);
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'gatunamn',
      data: gatunamnsData,
      message: gatunamnsData.length > 0 ? 
        `Hittade ${gatunamnsData.length} gatunamn` : 
        'Ingen gatunamnsdata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av gatunamnsdata:', error);
    return { 
      success: false,
      dataType: 'gatunamn',
      error: 'Kunde inte tolka svaret från Trafikverket för gatunamn',
      rawData: apiResponse 
    };
  }
}

/**
 * Parsar API-svaret för funktionell vägklass data
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad data för funktionell vägklass
 */
function parseFunktionellVägklassData(apiResponse) {
  try {
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Ingen data för funktionell vägklass hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen data för funktionell vägklass hittades' 
      };
    }

    // Försök hämta funktionell vägklass från resultatet - testa båda möjliga nycklar
    let vägklassData = [];
    
    if (apiResponse.RESPONSE.RESULT[0]['FunktionellVägklass']) {
      vägklassData = Array.isArray(apiResponse.RESPONSE.RESULT[0]['FunktionellVägklass']) 
        ? apiResponse.RESPONSE.RESULT[0]['FunktionellVägklass'] 
        : [apiResponse.RESPONSE.RESULT[0]['FunktionellVägklass']];
    }
    
    console.log("Parsed funktionell vägklass data:", vägklassData);
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'funktionellVägklass',
      data: vägklassData,
      message: vägklassData.length > 0 ? 
        `Hittade funktionell vägklass: ${vägklassData[0]?.Klass || 'Okänd'}` : 
        'Ingen data för funktionell vägklass hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av funktionell vägklass data:', error);
    return { 
      success: false,
      dataType: 'funktionellVägklass',
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
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Ingen hastighetsbegränsningsdata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen hastighetsbegränsningsdata hittades' 
      };
    }

    // Försök hämta hastighetsbegränsning från resultatet
    let hastighetData = [];
    
    if (apiResponse.RESPONSE.RESULT[0].Hastighetsgräns) {
      hastighetData = Array.isArray(apiResponse.RESPONSE.RESULT[0].Hastighetsgräns) 
        ? apiResponse.RESPONSE.RESULT[0].Hastighetsgräns 
        : [apiResponse.RESPONSE.RESULT[0].Hastighetsgräns];
    }
    
    console.log("Parsed hastighetsdata:", hastighetData);
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'hastighet',
      data: hastighetData,
      message: hastighetData.length > 0 ? 
        `Hittade hastighetsbegränsning: ${hastighetData[0]?.Högsta_tillåtna_hastighet || 'N/A'} km/h` : 
        'Ingen hastighetsbegränsningsdata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av hastighetsbegränsningsdata:', error);
    return { 
      success: false,
      dataType: 'hastighet',
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
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Ingen väghållardata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen väghållardata hittades' 
      };
    }

    // Försök hämta väghållare från resultatet
    let väghållareData = [];
    
    if (apiResponse.RESPONSE.RESULT[0].Väghållare) {
      väghållareData = Array.isArray(apiResponse.RESPONSE.RESULT[0].Väghållare) 
        ? apiResponse.RESPONSE.RESULT[0].Väghållare 
        : [apiResponse.RESPONSE.RESULT[0].Väghållare];
    }
    
    console.log("Parsed väghållardata:", väghållareData);
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'väghållare',
      data: väghållareData,
      message: väghållareData.length > 0 ? 
        `Hittade väghållare: ${väghållareData[0]?.Väghållartyp || 'Okänd'}` : 
        'Ingen väghållardata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av väghållardata:', error);
    return { 
      success: false,
      dataType: 'väghållare',
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
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Ingen vägbreddsdata hittades i svaret');
      return { 
        success: true, 
        data: [], 
        message: 'Ingen vägbreddsdata hittades' 
      };
    }

    // Försök hämta vägbredd från resultatet
    let vägbreddData = [];
    
    if (apiResponse.RESPONSE.RESULT[0].Vägbredd) {
      vägbreddData = Array.isArray(apiResponse.RESPONSE.RESULT[0].Vägbredd) 
        ? apiResponse.RESPONSE.RESULT[0].Vägbredd 
        : [apiResponse.RESPONSE.RESULT[0].Vägbredd];
    }
    
    console.log("Parsed vägbreddsdata:", vägbreddData);
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: 'vägbredd',
      data: vägbreddData,
      message: vägbreddData.length > 0 ? 
        `Hittade vägbredd: ${vägbreddData[0]?.Bredd || 'N/A'} meter` : 
        'Ingen vägbreddsdata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av vägbreddsdata:', error);
    return { 
      success: false,
      dataType: 'vägbredd',
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
    console.log(`Skickar API-anrop till Trafikverket för området: ${x1},${y1} - ${x2},${y2}`);
    
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
   console.log('Fick svar från API för områdessökning:', data);
   
   // Använd nätanknytning för att få mer detaljerad information
   try {
     const detailedData = await getNärmasteVäg(x, y);
     
     // Kombinera resultat från båda anropen
     const result = parseVägdata(data);
     result.rawResponse = data;
     
     // Lägg till detaljerad information från nätanknytningen
     if (detailedData.success) {
       result.gatuNamnDetails = detailedData.gatuNamnDetails;
       result.funktionellVägklassDetails = detailedData.funktionellVägklassDetails;
       result.hastighetDetails = detailedData.hastighetDetails;
       result.väghållareDetails = detailedData.väghållareDetails;
       result.vägbreddDetails = detailedData.vägbreddDetails;
     }
     
     return result;
   } catch (detailsError) {
     console.error('Kunde inte hämta detaljerad väginformation via nätanknytning:', detailsError);
     return parseVägdata(data);
   }
 } catch (error) {
   console.error('Fel vid API-anrop till Trafikverket för områdessökning:', error);
   throw error;
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