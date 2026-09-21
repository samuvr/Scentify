/**
 * Fichas de prueba para el parser de la seccion 5.
 *
 * IMPORTANTE: son sinteticas, escritas a mano reproduciendo las dos formas en
 * que se renderiza el bloque "Cuando usarlo". No son capturas de Fragrantica:
 * la especificacion prohibe la recoleccion automatizada y estos tests no tocan
 * la red. Sirven para fijar el comportamiento del parser; el ajuste fino contra
 * el HTML real hay que hacerlo pegando una ficha de verdad.
 */

/**
 * Ficha muy votada: el bloque enseña el numero de votos Y la anchura de la
 * barra. Es la maquetacion habitual de un superventas.
 */
export const FICHA_MUY_VOTADA = `
<!doctype html>
<html>
<head><title>Khamrah by Lattafa Perfumes</title></head>
<body>
  <h1>Khamrah <span itemprop="brand">Lattafa Perfumes</span></h1>
  <p>Khamrah was launched in 2022.</p>

  <div class="accords">
    <div class="accord-bar" style="width: 100%; background: #6b3f1d">warm spicy</div>
    <div class="accord-bar" style="width: 88.4%; background: #b8860b">cinnamon</div>
    <div class="accord-bar" style="width: 71.2%; background: #8b4513">woody</div>
  </div>

  <div id="pyramid">
    <h4>Top Notes</h4>
    <div class="notes-box">
      <div><img src="cinnamon.jpg"><div>Cinnamon</div></div>
      <div><img src="nutmeg.jpg"><div>Nutmeg</div></div>
      <div><img src="bergamot.jpg"><div>Bergamot</div></div>
    </div>
    <h4>Middle Notes</h4>
    <div class="notes-box">
      <div><img src="dates.jpg"><div>Dates</div></div>
      <div><img src="praline.jpg"><div>Praline</div></div>
      <div><img src="tuberose.jpg"><div>Tuberose</div></div>
    </div>
    <h4>Base Notes</h4>
    <div class="notes-box">
      <div><img src="vanilla.jpg"><div>Vanilla</div></div>
      <div><img src="tonka.jpg"><div>Tonka Bean</div></div>
      <div><img src="benzoin.jpg"><div>Benzoin</div></div>
      <div><img src="myrrh.jpg"><div>Myrrh</div></div>
    </div>
  </div>

  <div class="when-to-wear">
    <h5>When to wear Khamrah</h5>
    <div class="voting-small-chart-size">
      <div class="cell"><span class="vote-button-legend">winter</span></div>
      <div class="cell"><div class="voting-small-chart-size" style="width: 100%">
        <div style="width: 92.4138%; background: #cc9966;"></div></div>
        <span class="vote-count">268</span>
      </div>
      <div class="cell"><span class="vote-button-legend">spring</span></div>
      <div class="cell"><div class="voting-small-chart-size" style="width: 100%">
        <div style="width: 41.0345%; background: #cc9966;"></div></div>
        <span class="vote-count">119</span>
      </div>
      <div class="cell"><span class="vote-button-legend">summer</span></div>
      <div class="cell"><div class="voting-small-chart-size" style="width: 100%">
        <div style="width: 14.4828%; background: #cc9966;"></div></div>
        <span class="vote-count">42</span>
      </div>
      <div class="cell"><span class="vote-button-legend">fall</span></div>
      <div class="cell"><div class="voting-small-chart-size" style="width: 100%">
        <div style="width: 78.6207%; background: #cc9966;"></div></div>
        <span class="vote-count">228</span>
      </div>
    </div>
    <div class="voting-small-chart-size">
      <div class="cell"><span class="vote-button-legend">day</span></div>
      <div class="cell"><div style="width: 38.0952%; background: #cc9966;"></div>
        <span class="vote-count">96</span>
      </div>
      <div class="cell"><span class="vote-button-legend">night</span></div>
      <div class="cell"><div style="width: 100%; background: #cc9966;"></div>
        <span class="vote-count">252</span>
      </div>
    </div>
  </div>
</body>
</html>
`;

/**
 * Ficha de nicho con pocos datos: el bloque se renderiza SIN el numero visible,
 * solo con la anchura de la barra, y falta la piramide de corazon. El parser
 * tiene que apañarse igual.
 */
export const FICHA_DE_NICHO = `
<!doctype html>
<html>
<head><title>Oud Sahraa by Asdaaf</title></head>
<body>
  <h1>Oud Sahraa</h1>
  <p>This fragrance was launched in 2021.</p>

  <div id="pyramid">
    <h4>Top Notes</h4>
    <div><img src="saffron.jpg"><div>Saffron</div></div>
    <h4>Base Notes</h4>
    <div><img src="oud.jpg"><div>Agarwood (Oud)</div></div>
    <div><img src="sandal.jpg"><div>Sandalwood</div></div>
  </div>

  <div class="when-to-wear">
    <h5>When to wear</h5>
    <div class="grid-x">
      <div class="cell small-3">winter</div>
      <div class="cell small-9"><div style="width: 100.0%; background: #cc9966;"></div></div>
    </div>
    <div class="grid-x">
      <div class="cell small-3">spring</div>
      <div class="cell small-9"><div style="width: 25.0%; background: #cc9966;"></div></div>
    </div>
    <div class="grid-x">
      <div class="cell small-3">summer</div>
      <div class="cell small-9"><div style="width: 0.0%; background: #cc9966;"></div></div>
    </div>
    <div class="grid-x">
      <div class="cell small-3">fall</div>
      <div class="cell small-9"><div style="width: 75.0%; background: #cc9966;"></div></div>
    </div>
    <div class="grid-x">
      <div class="cell small-3">day</div>
      <div class="cell small-9"><div style="width: 20.0%; background: #cc9966;"></div></div>
    </div>
    <div class="grid-x">
      <div class="cell small-3">night</div>
      <div class="cell small-9"><div style="width: 80.0%; background: #cc9966;"></div></div>
    </div>
  </div>
</body>
</html>
`;

/**
 * Lo que el usuario pega en el textarea cuando la peticion falla (fallback 1 de
 * la 5.2): texto plano copiado del navegador, sin una sola etiqueta HTML.
 */
export const TEXTO_PEGADO = `
When to wear Khamrah
winter 268
spring 119
summer 42
fall 228
day 96
night 252
`;

/** Una pagina cualquiera que no es una ficha: el parser no debe inventarse nada. */
export const PAGINA_SIN_DATOS = `
<!doctype html>
<html><head><title>Error 403</title></head>
<body><h1>Attention Required</h1><p>Please enable cookies.</p></body></html>
`;
