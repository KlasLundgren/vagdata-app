/**
 * Service för att kommunicera med Trafikverkets API
 */

// Bas-URL för Trafikverkets API
const API_URL = 'https://api.trafikinfo.trafikverket.se/v2/data.json';

// API-nyckel från Trafikverket
const API_KEY = '808cbb28635742ba98e00c9beaa95956'; 

/**
 * Använder nätanknytningsfunktionen för att hitta närmaste väg och dess egenskaper
 * @param {number} x - X-koordinat i SWEREF99TM (Easting)
 * @param {number} y - Y-koordinat i SWEREF99TM (Northing)
 * @returns {Promise<Object>} - Vägdata för närmaste väg
 */
export async function getNärmasteVäg(x, y) {
  try {
    console.log(`Skickar nätanknytnings-anrop till Trafikverket med koordinater: E=${x}, N=${y}`);
    
    // Parallellisera API-anrop för olika vägegenskaper för bättre prestanda
    const [
      basicRoadData,
      gatuNamnData, 
      funktionellVägklassData,
      hastighetData, 
      väghållareData, 
      vägbreddData
    ] = await Promise.all([
      fetchSnapData(x, y),
      fetchRoadProperty("Gatunamn", x, y),
      fetchRoadProperty("FunktionellVägklass", x, y),
      fetchRoadProperty("Hastighetsgräns", x, y),
      fetchRoadProperty("Väghållare", x, y),
      fetchRoadProperty("Vägbredd", x, y)
    ]);
    
    // Kombinera alla resultat
    const result = {
      ...basicRoadData,
      gatuNamnDetails: gatuNamnData,
      funktionellVägklassDetails: funktionellVägklassData,
      hastighetDetails: hastighetData,
      väghållareDetails: väghållareData,
      vägbreddDetails: vägbreddData,
      message: 'Nätanknytning lyckades',
      success: true
    };
    
    console.log("API-svarsdetaljer sammanställda");
    
    return result;
  } catch (error) {
    console.error('Fel vid API-anrop till Trafikverket:', error);
    throw error;
  }
}

/**
 * Hämtar grundläggande snapp-data med för vägnätet
 * @param {number} x - X-koordinat i SWEREF99TM
 * @param {number} y - Y-koordinat i SWEREF99TM
 * @returns {Promise<Object>} - Grundläggande vägdata med snap-resultat
 */
async function fetchSnapData(x, y) {
  // Först hämta information om själva snapp-punkten för att spara till evalResults
  const snapRequestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}"/>
      <QUERY objecttype="Vägnummer" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <INCLUDE>GID</INCLUDE>
        <EVAL alias="Närmaste länk" function="$function.vägdata_v1.SnapToRoadNetwork(${x}, ${y}, MaxDistance=500)" />
      </QUERY>
    </REQUEST>
  `;
  
  // Sedan hämta vägnummer-data med samma filter-princip
  const vägnummerRequestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}"/>
      <QUERY objecttype="Vägnummer" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <and>
            <EQ name="Element_Id" value="$function.vägdata_v1.SnapToRoadNetwork(${x}, ${y}).Element_Id" />
          </and>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        <INCLUDE>Huvudnummer</INCLUDE>
      </QUERY>
    </REQUEST>
  `;

  try {
    // Först hämta EVAL-resultatet för att ha detaljerad snapp-information
    const snapResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Accept': 'application/json'
      },
      body: snapRequestXml
    });

    if (!snapResponse.ok) {
      const errorText = await snapResponse.text();
      console.error('API svarade med felkod för snap-anrop:', snapResponse.status, errorText);
      throw new Error(`API-anrop misslyckades: ${snapResponse.status} ${snapResponse.statusText}`);
    }

    const snapData = await snapResponse.json();
    
    // Sedan hämta vägnummerdata med filter
    const vägnummerResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Accept': 'application/json'
      },
      body: vägnummerRequestXml
    });

    if (!vägnummerResponse.ok) {
      const errorText = await vägnummerResponse.text();
      console.error('API svarade med felkod för vägnummer:', vägnummerResponse.status, errorText);
      throw new Error(`API-anrop misslyckades: ${vägnummerResponse.status} ${vägnummerResponse.statusText}`);
    }

    const vägnummerData = await vägnummerResponse.json();
    
    console.log('Fick grundläggande data från API');
    
    // Kombinera resultat från båda anropen
    const snapResult = parseSnapToRoadData(snapData);
    const vägnummerResult = parseVägnummerData(vägnummerData);
    
    const result = {
      ...vägnummerResult,
      evalResults: snapResult.evalResults,
      rawResponse: {
        snap: snapData,
        vägnummer: vägnummerData
      }
    };
    
    return result;
  } catch (error) {
    console.error('Fel vid inhämtning av grunddata:', error);
    return { 
      success: false,
      error: 'Kunde inte hämta grundläggande vägdata',
      message: error.message
    };
  }
}

/**
 * Hämtar specifik vägegenskap baserat på direktkoppling till koordinater
 * @param {string} objectType - Typ av vägegenskap att hämta
 * @param {number} x - X-koordinat i SWEREF99TM
 * @param {number} y - Y-koordinat i SWEREF99TM
 * @returns {Promise<Object>} - Detaljerad data om vägegenskapen
 */
async function fetchRoadProperty(objectType, x, y) {
  // Skapa XML-förfrågan för vägegenskapen med direkt SnapToRoadNetwork i filtret
  const requestXml = `
    <REQUEST>
      <LOGIN authenticationkey="${API_KEY}" />
      <QUERY objecttype="${objectType}" namespace="vägdata.nvdb_dk_o" schemaversion="1.2" limit="1">
        <FILTER>
          <and>
            <EQ name="Element_Id" value="$function.vägdata_v1.SnapToRoadNetwork(${x}, ${y}).Element_Id" />
          </and>
        </FILTER>
        <INCLUDE>GID</INCLUDE>
        ${getIncludesForObjectType(objectType)}
      </QUERY>
    </REQUEST>
  `;

  try {
    console.log(`Hämtar ${objectType} för koordinater E=${x}, N=${y}`);
    
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
      console.error(`API svarade med felkod för ${objectType}:`, response.status, errorText);
      throw new Error(`API-anrop för ${objectType} misslyckades: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Fick svar från API (${objectType}):`, JSON.stringify(data, null, 2));
    
    // Använd lämplig parser baserat på objekttyp
    return parsePropertyData(objectType, data);
  } catch (error) {
    console.error(`Fel vid API-anrop för ${objectType}:`, error);
    return { 
      success: false,
      dataType: objectType.toLowerCase(),
      error: `Kunde inte hämta ${objectType}`,
      message: error.message
    };
  }
}

/**
 * Returnerar lämpliga INCLUDE-taggar för olika objekttyper
 * @param {string} objectType - Typ av vägegenskap
 * @returns {string} - XML-fragment med INCLUDE-taggar
 */
function getIncludesForObjectType(objectType) {
  switch(objectType) {
    case "Gatunamn":
      return '<INCLUDE>Namn</INCLUDE>';
    case "FunktionellVägklass":
      return '<INCLUDE>Klass</INCLUDE>';
    case "Hastighetsgräns":
      return '<INCLUDE>Högsta_tillåtna_hastighet</INCLUDE>';
    case "Väghållare":
      return '<INCLUDE>Väghållarnamn</INCLUDE><INCLUDE>Väghållartyp</INCLUDE>';
    case "Vägbredd":
      return '<INCLUDE>Bredd</INCLUDE>';
    default:
      return '';
  }
}

/**
 * Parsar API-svaret beroende på objekttyp
 * @param {string} objectType - Typ av vägegenskap
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Parsad data
 */
function parsePropertyData(objectType, apiResponse) {
  try {
    // Kontrollera att vi har ett giltigt svar
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log(`Inga data för ${objectType} hittades i svaret`);
      return { 
        success: true, 
        dataType: objectType.toLowerCase(),
        data: [], 
        message: `Inga data för ${objectType} hittades` 
      };
    }

    // Försök hämta data från resultatet
    let propertyData = [];
    
    if (apiResponse.RESPONSE.RESULT[0][objectType]) {
      propertyData = Array.isArray(apiResponse.RESPONSE.RESULT[0][objectType]) 
        ? apiResponse.RESPONSE.RESULT[0][objectType] 
        : [apiResponse.RESPONSE.RESULT[0][objectType]];
    }
    
    console.log(`Parsed ${objectType} data:`, propertyData);
    
    // Formatera meddelande baserat på objekttyp
    let message;
    switch(objectType) {
      case "Gatunamn":
        message = propertyData.length > 0 ? 
          `Hittade ${propertyData.length} gatunamn` : 'Ingen gatunamnsdata hittades';
        break;
      case "FunktionellVägklass":
        message = propertyData.length > 0 ? 
          `Hittade funktionell vägklass: ${propertyData[0]?.Klass || 'Okänd'}` : 
          'Ingen data för funktionell vägklass hittades';
        break;
      case "Hastighetsgräns":
        message = propertyData.length > 0 ? 
          `Hittade hastighetsbegränsning: ${propertyData[0]?.Högsta_tillåtna_hastighet || 'N/A'} km/h` : 
          'Ingen hastighetsbegränsningsdata hittades';
        break;
      case "Väghållare":
        message = propertyData.length > 0 ? 
          `Hittade väghållare: ${propertyData[0]?.Väghållartyp || 'Okänd'}` : 
          'Ingen väghållardata hittades';
        break;
      case "Vägbredd":
        message = propertyData.length > 0 ? 
          `Hittade vägbredd: ${propertyData[0]?.Bredd || 'N/A'} meter` : 
          'Ingen vägbreddsdata hittades';
        break;
      default:
        message = `Hittade ${propertyData.length} resultat för ${objectType}`;
    }
    
    // Returnera formaterad data
    return {
      success: true,
      dataType: objectType.toLowerCase(),
      data: propertyData,
      message: message
    };
  } catch (error) {
    console.error(`Fel vid parsning av ${objectType}-data:`, error);
    return { 
      success: false,
      dataType: objectType.toLowerCase(),
      error: `Kunde inte tolka svaret från Trafikverket för ${objectType}`,
      rawData: apiResponse 
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
        evalResults: {},
        message: 'Inga nätanknytningsresultat hittades' 
      };
    }
    
    // Extrahera utvärderingsresultat från nätanknytningsfunktionen
    const evalResults = apiResponse.RESPONSE.RESULT[0].INFO.EVALRESULT;
    const roadLinkData = {};
    
    evalResults.forEach(result => {
      const key = Object.keys(result)[0];
      roadLinkData[key] = result[key];
    });
    
    return {
      success: true,
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
 * Parsar API-svaret för vägnummerdata
 * @param {Object} apiResponse - Svaret från Trafikverkets API
 * @returns {Object} - Formaterad vägnummerdata
 */
function parseVägnummerData(apiResponse) {
  try {
    // Kontrollera att vi har giltiga data
    if (!apiResponse.RESPONSE || 
        !apiResponse.RESPONSE.RESULT || 
        apiResponse.RESPONSE.RESULT.length === 0) {
      console.log('Inga vägnummerdata hittades i svaret');
      return { 
        success: true, 
        data: [],
        message: 'Inga vägnummerdata hittades' 
      };
    }

    // Extrahera vägnummerdata
    const vägdata = apiResponse.RESPONSE.RESULT[0].Vägnummer || [];
    
    return {
      success: true,
      data: Array.isArray(vägdata) ? vägdata : [vägdata],
      message: vägdata.length > 0 ? 
        `Hittade ${vägdata.length} vägnummer` : 'Inga vägnummerdata hittades'
    };
  } catch (error) {
    console.error('Fel vid parsning av vägnummerdata:', error);
    return { 
      success: false,
      error: 'Kunde inte tolka svaret från Trafikverket för vägnummer',
      rawData: apiResponse 
    };
  }
}