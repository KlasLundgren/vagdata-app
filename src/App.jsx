import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import { getVägdataFrånKoordinat, getNärmasteVäg } from './services/trafikverketApi';
import './App.css';

// Definiera projektioner för konvertering
const wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";
const sweref99tm = "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +axis=neu";

function App() {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roadData, setRoadData] = useState(null);
  const [roadLinkData, setRoadLinkData] = useState(null);
  const [coords, setCoords] = useState(null);
  const [apiMethod, setApiMethod] = useState('roadnet'); // 'roadnet' eller 'bbox'
  const [showDebug, setShowDebug] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState(null);

  // Växla mellan API-metoder
  const toggleApiMethod = () => {
    setApiMethod(prev => prev === 'roadnet' ? 'bbox' : 'roadnet');
  };

  // Växla debug-panelen
  const toggleDebug = () => {
    setShowDebug(prev => !prev);
  };

  useEffect(() => {
    // Kontrollera om kartan redan är initierad
    if (leafletMapRef.current) {
      return;
    }

    if (!window.L) {
      console.error("Leaflet is not loaded!");
      return;
    }

    // Skapa karta direkt med Leaflet (inte react-leaflet)
    const map = window.L.map(mapRef.current, {
      minZoom: 5,
      maxZoom: 18,
      zoomControl: true,
      attributionControl: true,
      center: [62.5, 16.5],
      zoom: 5
    });
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Spara kartreferensen
    leafletMapRef.current = map;

    // Hantera klick på kartan
    map.on('click', async function(e) {
      try {
        const { lat, lng } = e.latlng;
        
        // Konvertera till SWEREF99TM
        const [eastingSWEREF, northingSWEREF] = proj4(wgs84, sweref99tm, [lng, lat]);
        
        // Spara koordinater för visning
        setCoords({
          wgs84: { lat, lng },
          sweref99tm: { easting: eastingSWEREF, northing: northingSWEREF }
        });
        
        // Visa laddningsindikator
        setLoading(true);
        setError(null);
        
        // Skapa eller uppdatera markör först, så den alltid visas oavsett API-resultat
        if (markerRef.current) {
          map.removeLayer(markerRef.current);
        }
        
        // Lägg till grundläggande markör utan vägdata
        markerRef.current = window.L.marker([lat, lng])
          .addTo(map)
          .bindPopup(`
            <div class="popup-content">
              <h3>Koordinater</h3>
              <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
              <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
              <hr>
              <h3>API-status</h3>
              <p>Hämtar vägdata...</p>
            </div>
          `)
          .openPopup();
        
        // Rensa tidigare data
        setRoadData(null);
        setRoadLinkData(null);
        
        try {
          // Hämta vägdata från API:et beroende på vald metod
          console.log(`Söker vägdata runt koordinat: ${eastingSWEREF}, ${northingSWEREF}`);
          
          if (apiMethod === 'roadnet') {
            // Använd nätanknytningsfunktionen
            const vägdata = await getNärmasteVäg(eastingSWEREF, northingSWEREF);
            setRoadLinkData(vägdata);
            setRawApiResponse(vägdata.rawResponse);
            console.log("Satte vägnätdata:", vägdata);
            
            // Uppdatera popup med API-resultat
            if (markerRef.current && vägdata) {
              markerRef.current.setPopupContent(`
                <div class="popup-content">
                  <h3>Koordinater</h3>
                  <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                  <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                  <hr>
                  <h3>API-status</h3>
                  <p>${vägdata?.success ? 'API-anrop lyckades' : 'API-anrop misslyckades'}</p>
                  <p>${vägdata?.message || (vägdata?.error ? `Fel: ${vägdata.error}` : '')}</p>
                </div>
              `);
            }
            
            // Om vi har en nätanknytningspunkt, visa den också
            if (vägdata?.evalResults && vägdata.evalResults['Närmaste länk']) {
              try {
                const linkPoint = vägdata.evalResults['Närmaste länk'].Geometry;
                // Extrahera koordinaterna från POINT (xxx.xx yyy.yy)
                const match = linkPoint.match(/POINT \(([0-9.]+) ([0-9.]+)\)/);
                if (match && match.length === 3) {
                  const roadX = parseFloat(match[1]);
                  const roadY = parseFloat(match[2]);
                  
                  // Konvertera SWEREF99TM till WGS84 för att visa på kartan
                  const [roadLng, roadLat] = proj4(sweref99tm, wgs84, [roadX, roadY]);
                  
                  // Skapa en road marker med annan färg
                  window.L.circleMarker([roadLat, roadLng], {
                    radius: 8,
                    fillColor: '#3388ff',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                  }).addTo(map).bindPopup('Närmaste vägpunkt');
                }
              } catch (err) {
                console.error('Kunde inte visa nätanknytningspunkt:', err);
              }
            }
          } else {
            // Använd box-sökning
            const vägdata = await getVägdataFrånKoordinat(eastingSWEREF, northingSWEREF);
            setRoadData(vägdata);
            console.log("Satte vägdata:", vägdata);
            
            // Uppdatera popup med API-resultat
            if (markerRef.current && vägdata) {
              markerRef.current.setPopupContent(`
                <div class="popup-content">
                  <h3>Koordinater</h3>
                  <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                  <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                  <hr>
                  <h3>API-status</h3>
                  <p>${vägdata?.success ? 'API-anrop lyckades' : 'API-anrop misslyckades'}</p>
                  <p>${vägdata?.message || (vägdata?.error ? `Fel: ${vägdata.error}` : '')}</p>
                </div>
              `);
            }
          }
        } catch (apiError) {
          console.error('Fel vid API-anrop:', apiError);
          setError('Kunde inte hämta vägdata: ' + apiError.message);
          
          // Uppdatera popup med felmeddelande
          if (markerRef.current) {
            markerRef.current.setPopupContent(`
              <div class="popup-content">
                <h3>Koordinater</h3>
                <p><strong>WGS84:</strong><br>${lat.toFixed(6)}, ${lng.toFixed(6)}</p>
                <p><strong>SWEREF99TM:</strong><br>E: ${eastingSWEREF.toFixed(2)}<br>N: ${northingSWEREF.toFixed(2)}</p>
                <hr>
                <h3>API-status</h3>
                <p>API-anrop misslyckades: ${apiError.message}</p>
              </div>
            `);
          }
        }
      } catch (err) {
        console.error('Fel vid klickhantering:', err);
        setError('Ett fel uppstod: ' + err.message);
        
        // Säkerställ att koordinatpanelen alltid uppdateras om koordinaterna kunde extraheras
        if (e && e.latlng) {
          const { lat, lng } = e.latlng;
          try {
            const [easting, northing] = proj4(wgs84, sweref99tm, [lng, lat]);
            setCoords({
              wgs84: { lat, lng },
              sweref99tm: { easting, northing }
            });
          } catch (projError) {
            console.error('Kunde inte konvertera koordinater:', projError);
          }
        }
      } finally {
        setLoading(false);
      }
    });

    // Städa upp när komponenten avmonteras
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [apiMethod]);

  // Funktion för att rendera en informationssektion i sidopanelen
  const renderInfoSection = (title, content) => {
    if (!content) return null;
    return (
      <div className="info-section">
        <h3>{title}</h3>
        {content}
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Vägdata Sverige</h1>
        <div className="api-controls">
          <button 
            onClick={toggleApiMethod} 
            className={`api-method-btn ${apiMethod === 'roadnet' ? 'active' : ''}`}
          >
            {apiMethod === 'roadnet' ? 'Använder: Nätnätknytning' : 'Använder: Område-sökning'}
          </button>
          <button 
            onClick={toggleDebug}
            className={`debug-btn ${showDebug ? 'active' : ''}`}
          >
            {showDebug ? 'Dölj API-detaljer' : 'Visa API-detaljer'}
          </button>
        </div>
        {loading && <div className="loading-indicator">Hämtar vägdata...</div>}
        {error && <div className="error-message">{error}</div>}
      </header>
      
      <div 
        ref={mapRef} 
        className="map-container"
      ></div>

      {/* Ny enhetlig sidopanel som ersätter de tre tidigare separata panelerna */}
      {(coords || roadData || roadLinkData) && (
        <div className="side-panel">
          <h2>Vägdata information</h2>
          
          {/* Koordinatsektion */}
          {coords && renderInfoSection("Koordinater", (
            <div>
              <h4>WGS84:</h4>
              <p>{coords.wgs84.lat.toFixed(6)}, {coords.wgs84.lng.toFixed(6)}</p>
              <h4>SWEREF99TM:</h4>
              <p>E: {coords.sweref99tm.easting.toFixed(2)}<br />N: {coords.sweref99tm.northing.toFixed(2)}</p>
            </div>
          ))}

          {/* Nätanknytningsresultat */}
          {roadLinkData?.evalResults && renderInfoSection("Nätanknytningsresultat", (
            <div>
              {roadLinkData.evalResults['Närmaste länk'] && (
                <div className="data-item">
                  <h4>Närmaste länk</h4>
                  <p><strong>Element ID:</strong> {roadLinkData.evalResults['Närmaste länk'].Element_Id}</p>
                  <p><strong>Offset:</strong> {parseFloat(roadLinkData.evalResults['Närmaste länk'].Offset).toFixed(4)}</p>
                </div>
              )}
            </div>
          ))}

          {/* Vägnummerdatasektion */}
          {roadLinkData?.data && roadLinkData.data.length > 0 && renderInfoSection("Vägnummerdata", (
            <ul className="data-list">
              {roadLinkData.data.map((väg, index) => (
                <li key={index} className="data-item">
                  {väg.Huvudnummer && <p><strong>Vägnummer:</strong> {väg.Huvudnummer}</p>}
                  {väg.Europavägsnummer && <p><strong>Europaväg:</strong> {väg.Europavägsnummer}</p>}
                  {väg.Vägkategori && <p><strong>Kategori:</strong> {väg.Vägkategori}</p>}
                  {väg.GID && <p><strong>GID:</strong> {väg.GID}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Gatunamnssektion */}
          {roadLinkData?.roadDetails?.data && roadLinkData.roadDetails.data.length > 0 && renderInfoSection("Gatunamn", (
            <ul className="data-list">
              {roadLinkData.roadDetails.data.map((gata, index) => (
                <li key={`gata-${index}`} className="data-item">
                  {gata.Namn && <p><strong>Namn:</strong> {gata.Namn}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Hastighetsbegränsning */}
          {roadLinkData?.hastighetDetails?.data && roadLinkData.hastighetDetails.data.length > 0 && renderInfoSection("Hastighetsbegränsning", (
            <ul className="data-list">
              {roadLinkData.hastighetDetails.data.map((hastighet, index) => (
                <li key={`hastighet-${index}`} className="data-item">
                  {hastighet.Värde && <p><strong>Hastighet:</strong> {hastighet.Värde} km/h</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Väghållare */}
          {roadLinkData?.väghållareDetails?.data && roadLinkData.väghållareDetails.data.length > 0 && renderInfoSection("Väghållare", (
            <ul className="data-list">
              {roadLinkData.väghållareDetails.data.map((väghållare, index) => (
                <li key={`väghållare-${index}`} className="data-item">
                  {väghållare.Väghållartyp && <p><strong>Typ:</strong> {väghållare.Väghållartyp}</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Vägbredd */}
          {roadLinkData?.vägbreddDetails?.data && roadLinkData.vägbreddDetails.data.length > 0 && renderInfoSection("Vägbredd", (
            <ul className="data-list">
              {roadLinkData.vägbreddDetails.data.map((bredd, index) => (
                <li key={`bredd-${index}`} className="data-item">
                  {bredd.Bredd && <p><strong>Bredd:</strong> {bredd.Bredd} meter</p>}
                </li>
              ))}
            </ul>
          ))}

          {/* Om vi använder område-sökning istället för nätanknytning */}
          {roadData?.success && roadData.data && renderInfoSection("Vägdata (Område-sökning)", (
            <div>
              {typeof roadData.data === 'object' && !Array.isArray(roadData.data) ? (
                <div>
                  {/* Gatunamn */}
                  {roadData.data.gatunamn && roadData.data.gatunamn.length > 0 && (
                    <div className="data-item">
                      <h4>Gatunamn</h4>
                      {roadData.data.gatunamn.map((gata, idx) => (
                        <p key={idx}>{gata.Namn || 'Okänt namn'}</p>
                      ))}
                    </div>
                  )}
                  
                  {/* Hastighet */}
                  {roadData.data.hastighet && roadData.data.hastighet.length > 0 && (
                    <div className="data-item">
                      <h4>Hastighetsbegränsning</h4>
                      {roadData.data.hastighet.map((hast, idx) => (
                        <p key={idx}>{hast.Värde || 'Okänd'} km/h</p>
                      ))}
                    </div>
                  )}
                  
                  {/* Väghållare */}
                  {roadData.data.väghållare && roadData.data.väghållare.length > 0 && (
                    <div className="data-item">
                      <h4>Väghållare</h4>
                      {roadData.data.väghållare.map((vh, idx) => (
                        <p key={idx}>{vh.Väghållartyp || 'Okänd'}</p>
                      ))}
                    </div>
                  )}
                  
                  {/* Vägbredd */}
                  {roadData.data.vägbredd && roadData.data.vägbredd.length > 0 && (
                    <div className="data-item">
                      <h4>Vägbredd</h4>
                      {roadData.data.vägbredd.map((bredd, idx) => (
                        <p key={idx}>{bredd.Bredd || 'Okänd'} meter</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                Array.isArray(roadData.data) && roadData.data.length > 0 ? (
                  <ul className="data-list">
                    {roadData.data.map((väg, index) => (
                      <li key={index} className="data-item">
                        {väg.Huvudnummer && <p><strong>Vägnummer:</strong> {väg.Huvudnummer}</p>}
                        {väg.Europavägsnummer && <p><strong>Europaväg:</strong> {väg.Europavägsnummer}</p>}
                        {väg.Vägkategori && <p><strong>Kategori:</strong> {väg.Vägkategori}</p>}
                        {väg.Name && <p><strong>Namn:</strong> {väg.Name}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Inga detaljerade vägdata hittades för denna position.</p>
                )
              )}
            </div>
          ))}

          {/* API-status/debug-information */}
          <div className="api-status">
            {roadData?.message && <p className="status-message">{roadData.message}</p>}
            {roadLinkData?.message && <p className="status-message">{roadLinkData.message}</p>}
            {roadData?.error && <p className="error-message">Fel: {roadData.error}</p>}
            {roadLinkData?.error && <p className="error-message">Fel: {roadLinkData.error}</p>}
          </div>
        </div>
      )}
      
      {/* Debug-panel för att visa råa API-svaret */}
      {showDebug && rawApiResponse && (
        <div className="debug-panel">
          <h2>API Debug Info</h2>
          <div className="debug-content">
            <pre>{JSON.stringify(rawApiResponse, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;