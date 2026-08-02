function $(selector) {
  return document.querySelector(selector);
}

/* =========================================================
   CONFIGURAÇÕES EXTERNAS
   ========================================================= */

const SOFALTA_API_BASE =
  "https://sofalta.eu/api/baratheon/v4/empreendimentos/curupyacquapark/produtos/ingressos/web?data=";

const SOFALTA_CHECKOUT_BASE =
  "https://sofalta.eu/meuingresso/no/curupyacquapark/#/ingressos/";

const DIAS_CONSULTA_OFERTAS = 30;
const CACHE_OFERTAS_MINUTOS = 10;

let ofertasEspeciaisAtuais = [];
let carregandoOfertas = false;

/* =========================================================
   MODAIS
   ========================================================= */

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.add("open");
  document.body.classList.add("modal-aberto");

  if (id === "modalCalendario") {
    renderizarCalendarios();
  }

  if (id === "modalOfertasEspeciais") {
    renderizarOfertasEspeciais();
  }
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;

  modal.classList.remove("open");

  const existeOutroModalAberto = document.querySelector(".modal.open");

  if (!existeOutroModalAberto) {
    document.body.classList.remove("modal-aberto");
  }
}

/* =========================================================
   DATAS E FORMATAÇÃO
   ========================================================= */

function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function adicionarDias(dataISO, quantidade) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  data.setDate(data.getDate() + quantidade);

  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")
  ].join("-");
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);

  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  });
}

function formatarDataCompleta(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);

  return data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatarMoeda(valor) {
  if (valor === "" || valor === null || valor === undefined) return "";

  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarMoedaCentavos(valorEmCentavos) {
  return (Number(valorEmCentavos || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

/* =========================================================
   BARRA DE STATUS
   ========================================================= */

function parqueJaFechouHoje() {
  const diaAtual = buscarDiaAtualNoCalendario();

  if (!diaAtual || diaAtual.status === "fechado") return false;

  const info = HORARIOS_FUNCIONAMENTO[diaAtual.status];

  if (!info || !info.horario || info.horario === "Fechado") return false;

  const partes = info.horario.split("às");
  if (partes.length < 2) return false;

  const horarioFinal = partes[1].trim();
  const match = horarioFinal.match(/(\d{1,2})h(?:(\d{2}))?/);

  if (!match) return false;

  const horaFechamento = Number(match[1]);
  const minutoFechamento = Number(match[2] || 0);

  const agora = new Date();

  return (
    agora.getHours() > horaFechamento ||
    (agora.getHours() === horaFechamento &&
      agora.getMinutes() >= minutoFechamento)
  );
}

function montarDataISO(ano, mesNome, dia) {
  const mesNumero = obterNumeroMes(mesNome);

  if (mesNumero === undefined) return "";

  return `${ano}-${String(mesNumero + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function buscarDiaAtualNoCalendario() {
  const hoje = hojeISO();

  if (
    typeof CALENDARIOS_FUNCIONAMENTO === "undefined" ||
    !CALENDARIOS_FUNCIONAMENTO.length
  ) {
    return null;
  }

  for (const calendario of CALENDARIOS_FUNCIONAMENTO) {
    for (const dia of calendario.dias) {
      const dataISO = montarDataISO(calendario.ano, calendario.mes, dia.dia);

      if (dataISO === hoje) {
        return {
          ...dia,
          data: dataISO,
          mes: calendario.mes,
          ano: calendario.ano
        };
      }
    }
  }

  return null;
}

function buscarDiaNoCalendario(dataISO) {
  if (
    typeof CALENDARIOS_FUNCIONAMENTO === "undefined" ||
    !CALENDARIOS_FUNCIONAMENTO.length
  ) {
    return null;
  }

  for (const calendario of CALENDARIOS_FUNCIONAMENTO) {
    for (const dia of calendario.dias) {
      const dataDia = montarDataISO(calendario.ano, calendario.mes, dia.dia);

      if (dataDia === dataISO) {
        return {
          ...dia,
          data: dataDia,
          mes: calendario.mes,
          ano: calendario.ano
        };
      }
    }
  }

  return null;
}

function buscarProximaAberturaDepoisDe(dataBaseISO) {
  if (
    typeof CALENDARIOS_FUNCIONAMENTO === "undefined" ||
    !CALENDARIOS_FUNCIONAMENTO.length
  ) {
    return null;
  }

  const aberturas = [];

  CALENDARIOS_FUNCIONAMENTO.forEach((calendario) => {
    calendario.dias.forEach((dia) => {
      const dataISO = montarDataISO(calendario.ano, calendario.mes, dia.dia);

      if (dataISO > dataBaseISO && dia.status !== "fechado") {
        const info = HORARIOS_FUNCIONAMENTO[dia.status];

        aberturas.push({
          ...dia,
          data: dataISO,
          mes: calendario.mes,
          ano: calendario.ano,
          horario: info ? info.horario : ""
        });
      }
    });
  });

  return aberturas.sort((a, b) => a.data.localeCompare(b.data))[0] || null;
}

function buscarProximaAberturaNoCalendario() {
  return buscarProximaAberturaDepoisDe(hojeISO());
}

function obterValoresDoDia(dia) {
  if (!dia) {
    return {
      visitante: 0,
      kids: 0,
      convidadoSocio: 0
    };
  }

  return {
    visitante: dia.visitante || 0,
    kids: dia.kids || 0,
    convidadoSocio: dia.convidadoSocio || 0
  };
}

function renderizarBarra() {
  const barra = $("#barraStatus");
  if (!barra) return;

  const diaAtual = buscarDiaAtualNoCalendario();

  const hojeAberto =
    diaAtual &&
    diaAtual.status !== "fechado" &&
    !parqueJaFechouHoje();

  if (hojeAberto) {
    const info = HORARIOS_FUNCIONAMENTO[diaAtual.status];
    const valores = obterValoresDoDia(diaAtual);

    barra.innerHTML = `
      <div class="barra-inner">
        <div class="barra-status status-aberto">
          <strong>🟢 Parque aberto hoje</strong>
          <span>${formatarData(diaAtual.data)}</span>
          <span>${info ? info.horario : ""}</span>
        </div>

        <div class="barra-precos">
          <span class="barra-precos-title">🎟️ Bilheteria hoje:</span>

          <span class="preco-pill">
            Adulto ${formatarMoeda(valores.visitante)}
          </span>

          <span class="preco-pill">
            Kids ${formatarMoeda(valores.kids)}
          </span>

          <span class="preco-pill">
            Convidado de Sócio ${formatarMoeda(valores.convidadoSocio)}
          </span>
        </div>

        <button
          class="link-meia"
          type="button"
          onclick="abrirModal('modalMeia')"
        >
          ℹ️ Meia-entrada
        </button>
      </div>
    `;

    return;
  }

  const proxima = buscarProximaAberturaNoCalendario();

  barra.innerHTML = `
    <div class="barra-inner barra-fechado">
      <div class="barra-status status-fechado">
        <strong>🔴 Parque fechado agora</strong>

        <span>
          ${
            proxima
              ? `Próxima abertura: ${formatarData(proxima.data)} • ${proxima.horario}`
              : "Consulte o calendário para as próximas datas."
          }
        </span>
      </div>

      <button
        class="link-meia"
        type="button"
        onclick="abrirModal('modalCalendario')"
      >
        📅 Ver calendário
      </button>
    </div>
  `;
}

/* =========================================================
   OFERTAS ESPECIAIS — SÓ FALTA EU
   Promoção:
   - segunda a sexta: valor menor que R$ 68,00
   - sábado, domingo ou feriado: valor menor que R$ 92,00
   ========================================================= */

function normalizarIngressosSofalta(data) {
  const lista = Array.isArray(data)
    ? data
    : data?.itens || data?.produtos || data?.ingressos || [];

  return lista
    .map((item) => {
      const valor =
        item?.tarifarios?.[0]?.valor ??
        item?.valorOriginal ??
        item?.valor ??
        0;

      return {
        id: item.iditens || item.id || "",
        nome: item.nome || "Ingresso",
        descricao: limparTexto(item.descricao || ""),
        valorCentavos: Number(valor || 0)
      };
    })
    .filter((item) => item.valorCentavos > 0);
}

function limparTexto(texto) {
  return String(texto)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ehFimDeSemana(dataISO) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diaSemana = data.getDay();

  return diaSemana === 0 || diaSemana === 6;
}

function ehFeriadoNoCalendario(dataISO) {
  const dia = buscarDiaNoCalendario(dataISO);

  return Boolean(
    dia &&
    String(dia.status || "").toLowerCase().includes("feriado")
  );
}

function limitePromocionalDaData(dataISO) {
  return ehFimDeSemana(dataISO) || ehFeriadoNoCalendario(dataISO)
    ? 9200
    : 6800;
}

function ehIngressoPromocional(ingresso, dataISO) {
  return ingresso.valorCentavos < limitePromocionalDaData(dataISO);
}

async function consultarIngressosSofalta(dataISO) {
  try {
    const resposta = await fetch(SOFALTA_API_BASE + dataISO, {
      method: "GET",
      cache: "no-store"
    });

    if (!resposta.ok) return [];

    const dados = await resposta.json();
    return normalizarIngressosSofalta(dados);
  } catch (erro) {
    console.warn(`Não foi possível consultar ofertas para ${dataISO}.`, erro);
    return [];
  }
}

function obterCacheOfertas() {
  try {
    const bruto = localStorage.getItem("curupy_ofertas_especiais");
    if (!bruto) return null;

    const cache = JSON.parse(bruto);
    const limite =
      Number(cache.criadoEm || 0) +
      CACHE_OFERTAS_MINUTOS * 60 * 1000;

    if (Date.now() > limite) {
      localStorage.removeItem("curupy_ofertas_especiais");
      return null;
    }

    return Array.isArray(cache.ofertas) ? cache.ofertas : null;
  } catch {
    return null;
  }
}

function salvarCacheOfertas(ofertas) {
  try {
    localStorage.setItem(
      "curupy_ofertas_especiais",
      JSON.stringify({
        criadoEm: Date.now(),
        ofertas
      })
    );
  } catch {
    // O funcionamento da página não depende do cache.
  }
}

async function buscarOfertasEspeciais() {
  const cache = obterCacheOfertas();

  if (cache) {
    ofertasEspeciaisAtuais = cache;
    atualizarCardOfertas();
    return cache;
  }

  if (carregandoOfertas) return ofertasEspeciaisAtuais;

  carregandoOfertas = true;

  const ofertas = [];
  const inicio = hojeISO();

  /*
   * Consulta em blocos pequenos para evitar dezenas de requisições
   * simultâneas à API.
   */
  const tamanhoLote = 5;

  for (let inicioLote = 1; inicioLote <= DIAS_CONSULTA_OFERTAS; inicioLote += tamanhoLote) {
    const datasLote = [];

    for (
      let deslocamento = inicioLote;
      deslocamento < inicioLote + tamanhoLote &&
      deslocamento <= DIAS_CONSULTA_OFERTAS;
      deslocamento++
    ) {
      datasLote.push(adicionarDias(inicio, deslocamento));
    }

    const resultados = await Promise.all(
      datasLote.map(async (dataISO) => ({
        dataISO,
        ingressos: await consultarIngressosSofalta(dataISO)
      }))
    );

    resultados.forEach(({ dataISO, ingressos }) => {
      ingressos
        .filter((ingresso) => ehIngressoPromocional(ingresso, dataISO))
        .forEach((ingresso) => {
          ofertas.push({
            ...ingresso,
            dataISO
          });
        });
    });
  }

  ofertasEspeciaisAtuais = removerOfertasDuplicadas(ofertas);
  salvarCacheOfertas(ofertasEspeciaisAtuais);
  carregandoOfertas = false;

  atualizarCardOfertas();

  return ofertasEspeciaisAtuais;
}

function removerOfertasDuplicadas(ofertas) {
  const mapa = new Map();

  ofertas.forEach((oferta) => {
    const chave = [
      oferta.id || oferta.nome,
      oferta.dataISO,
      oferta.valorCentavos
    ].join("|");

    if (!mapa.has(chave)) {
      mapa.set(chave, oferta);
    }
  });

  return [...mapa.values()].sort((a, b) => {
    const porData = a.dataISO.localeCompare(b.dataISO);

    if (porData !== 0) return porData;

    return a.valorCentavos - b.valorCentavos;
  });
}

function atualizarCardOfertas() {
  const card = $("#cardOfertasEspeciais");
  if (!card) return;

  if (ofertasEspeciaisAtuais.length > 0) {
    card.classList.remove("hidden");
    card.setAttribute(
      "aria-label",
      `${ofertasEspeciaisAtuais.length} oferta(s) especial(is) disponível(is)`
    );
  } else {
    card.classList.add("hidden");
  }
}

async function renderizarOfertasEspeciais() {
  const container = $("#ofertasEspeciaisContainer");
  if (!container) return;

  container.innerHTML = `
    <div class="loading-card">
      Consultando ofertas disponíveis...
    </div>
  `;

  const ofertas = ofertasEspeciaisAtuais.length
    ? ofertasEspeciaisAtuais
    : await buscarOfertasEspeciais();

  if (!ofertas.length) {
    container.innerHTML = `
      <div class="empty-offers">
        <span>🎟️</span>
        <strong>Nenhuma oferta especial disponível agora.</strong>
        <p>Os ingressos regulares continuam disponíveis normalmente.</p>

        <button
          class="btn rosa"
          type="button"
          onclick="fecharModal('modalOfertasEspeciais'); openIngressosModal();"
        >
          Ver ingressos
        </button>
      </div>
    `;

    return;
  }

  container.innerHTML = ofertas
    .map((oferta) => {
      return `
        <article class="offer-card">
          <span class="offer-tag">🎉 Oferta especial</span>

          <h3>${oferta.nome}</h3>

          <p class="offer-date">
            📅 ${formatarDataCompleta(oferta.dataISO)}
          </p>

          ${
            oferta.descricao
              ? `<p class="offer-description">${oferta.descricao}</p>`
              : ""
          }

          <strong class="offer-price">
            ${formatarMoedaCentavos(oferta.valorCentavos)}
          </strong>

          <button
            class="btn rosa full"
            type="button"
            onclick="comprarOfertaEspecial('${oferta.dataISO}')"
          >
            Comprar para esta data
          </button>
        </article>
      `;
    })
    .join("");
}

function comprarOfertaEspecial(dataISO) {
  const dataCheckout = dataISO.split("-").reverse().join("-");
  const dataCodificada = btoa(dataCheckout);

  window.open(SOFALTA_CHECKOUT_BASE + dataCodificada, "_blank");
}

/* =========================================================
   CALENDÁRIO DE FUNCIONAMENTO
   ========================================================= */

function renderizarCalendarios() {
  const container = $("#calendariosContainer");
  if (!container) return;

  if (
    typeof CALENDARIOS_FUNCIONAMENTO === "undefined" ||
    !CALENDARIOS_FUNCIONAMENTO.length
  ) {
    container.innerHTML =
      "<p>Calendário indisponível no momento. Tente recarregar a página.</p>";
    return;
  }

  const botoes = CALENDARIOS_FUNCIONAMENTO
    .map((calendario, index) => {
      return `
        <button type="button" onclick="mostrarCalendario(${index})">
          ${calendario.mes} ${calendario.ano}
        </button>
      `;
    })
    .join("");

  container.innerHTML = `
    <p>Selecione o mês para consultar os dias e horários de funcionamento.</p>

    <div class="calendarios-tabs">
      ${botoes}
    </div>

    <div id="calendarioRenderizado"></div>
  `;

  mostrarCalendario(0);
}

function obterNumeroMes(nomeMes) {
  const meses = {
    janeiro: 0,
    fevereiro: 1,
    março: 2,
    marco: 2,
    abril: 3,
    maio: 4,
    junho: 5,
    julho: 6,
    agosto: 7,
    setembro: 8,
    outubro: 9,
    novembro: 10,
    dezembro: 11
  };

  return meses[String(nomeMes).trim().toLowerCase()];
}

function mostrarCalendario(index) {
  const calendario = CALENDARIOS_FUNCIONAMENTO[index];
  const destino = $("#calendarioRenderizado");

  if (!calendario || !destino) return;

  const mesNumero = obterNumeroMes(calendario.mes);

  if (mesNumero === undefined) {
    destino.innerHTML = "<p>Mês inválido na planilha.</p>";
    return;
  }

  const primeiroDiaSemana = new Date(
    Number(calendario.ano),
    mesNumero,
    1
  ).getDay();

  const espacosVazios = Array.from({ length: primeiroDiaSemana })
    .map(() => `<div></div>`)
    .join("");

  const dias = calendario.dias
    .map((dia) => {
      const info = HORARIOS_FUNCIONAMENTO[dia.status];
      if (!info) return "";

      const dataISO = `${calendario.ano}-${String(mesNumero + 1).padStart(2, "0")}-${String(dia.dia).padStart(2, "0")}`;
      const dataPassada = dataISO < hojeISO();
      const classeDia = dataPassada ? "dia-passado" : info.classe;

      const textoDia = dataPassada
        ? "Encerrado"
        : dia.status === "fechado"
          ? "Fechado"
          : info.horario;

      return `
        <button
          type="button"
          class="cal-dia ${classeDia}"
          onclick="abrirInfoDia(${index}, ${dia.dia})"
        >
          <strong>${dia.dia}</strong>
          <span>${textoDia}</span>
        </button>
      `;
    })
    .join("");

  destino.innerHTML = `
    <div class="calendario-funcionamento">
      <h3>${calendario.mes} ${calendario.ano}</h3>
      <p>${calendario.observacao || ""}</p>

      <div class="legenda-funcionamento">
        <button type="button" onclick="filtrarCalendario('dia-semana')">
          <b class="legenda-cor semana"></b> Dias de semana
        </button>

        <button type="button" onclick="filtrarCalendario('dia-fim-semana')">
          <b class="legenda-cor fim"></b> Fins de semana
        </button>

        <button type="button" onclick="filtrarCalendario('dia-feriado')">
          <b class="legenda-cor feriado"></b> Feriados
        </button>

        <button type="button" onclick="filtrarCalendario('dia-fechado')">
          <b class="legenda-cor fechado"></b> Fechado
        </button>

        <button type="button" onclick="filtrarCalendario(null)">
          Mostrar todos
        </button>
      </div>

      <div class="cal-grid">
        <div>Dom</div>
        <div>Seg</div>
        <div>Ter</div>
        <div>Qua</div>
        <div>Qui</div>
        <div>Sex</div>
        <div>Sáb</div>

        ${espacosVazios}
        ${dias}
      </div>
    </div>
  `;
}

function filtrarCalendario(classe) {
  document.querySelectorAll(".cal-dia").forEach((dia) => {
    dia.classList.remove("oculto");

    if (classe && !dia.classList.contains(classe)) {
      dia.classList.add("oculto");
    }
  });
}

function gerarValoresBilheteria(dia) {
  const valores = obterValoresDoDia(dia);

  return `
    <div class="dia-bloco">
      <strong>🎟️ Valores na bilheteria</strong>

      <div class="valores-bilheteria">
        <div class="valor-item">
          <span>Ingresso individual</span>
          <strong>${formatarMoeda(valores.visitante)}</strong>
        </div>

        <div class="valor-item">
          <span>Kids — 5 a 11 anos</span>
          <strong>${formatarMoeda(valores.kids)}</strong>
        </div>

        <div class="valor-item">
          <span>Convidado de sócio</span>
          <strong>${formatarMoeda(valores.convidadoSocio)}</strong>
        </div>
      </div>

      <p class="observacao-valor">
        Valores para compra presencial na bilheteria.
      </p>
    </div>
  `;
}

function abrirInfoDia(indexCalendario, numeroDia) {
  const calendario = CALENDARIOS_FUNCIONAMENTO[indexCalendario];
  if (!calendario) return;

  const dia = calendario.dias.find((item) => item.dia === numeroDia);
  if (!dia) return;

  const info = HORARIOS_FUNCIONAMENTO[dia.status];
  const conteudo = $("#conteudoDiaCalendario");

  if (!info || !conteudo) return;

  const dataISO = montarDataISO(calendario.ano, calendario.mes, numeroDia);
  const dataTexto =
    `${String(numeroDia).padStart(2, "0")} de ` +
    `${calendario.mes} de ${calendario.ano}`;

  if (dia.status === "fechado") {
    const proxima = buscarProximaAberturaDepoisDe(dataISO);

    conteudo.innerHTML = `
      <div class="dia-info fechado">
        <h2>📅 ${dataTexto}</h2>

        <div class="dia-status vermelho">
          🔴 Parque fechado
        </div>

        <p>O parque não estará em funcionamento nesta data.</p>

        ${
          proxima
            ? `<p><strong>Próxima abertura:</strong> ${formatarData(proxima.data)} • ${proxima.horario}</p>`
            : `<p>Consulte outra data disponível no calendário para planejar sua visita.</p>`
        }
      </div>
    `;

    abrirModal("modalDiaCalendario");
    return;
  }

  conteudo.innerHTML = `
    <div class="dia-info">
      <h2>📅 ${dataTexto}</h2>

      <div class="dia-status verde">
        🟢 Parque aberto
      </div>

      <div class="dia-bloco">
        <strong>⏰ Horário de funcionamento</strong>
        <p>${info.horario}</p>
      </div>

      ${gerarValoresBilheteria(dia)}

      <div class="dia-bloco">
        <strong>📍 Como chegar</strong>
        <button class="btn azul" type="button" onclick="abrirMapa()">
          Abrir mapa
        </button>
      </div>

      <div class="dia-bloco destaque-online">
        <strong>🎟️ Compra antecipada pelo site</strong>

        <p>
          Comprando pelo site oficial, você garante as condições
          disponíveis online e mais praticidade na entrada.
        </p>

        <ul>
          <li>Compras online devem ser realizadas com pelo menos 1 dia de antecedência.</li>
          <li>Não é possível comprar online para utilizar no mesmo dia.</li>
          <li>Para uso no mesmo dia, a compra é realizada exclusivamente na bilheteria do parque.</li>
        </ul>

        <button
          class="btn rosa full"
          type="button"
          onclick="openIngressosModal()"
        >
          Consultar ingressos online
        </button>
      </div>
    </div>
  `;

  abrirModal("modalDiaCalendario");
}

/* =========================================================
   PÁGINAS E LINKS
   ========================================================= */

function abrirPaginaHospedagem() {
  window.location.href = "hospedagem.html";
}

function abrirPaginaAssociados() {
  window.location.href = "associados.html";
}

function abrirEmBreve(titulo) {
  const tituloModal = $("#tituloEmBreve");
  const textoModal = $("#textoEmBreve");

  if (tituloModal) {
    tituloModal.textContent = titulo || "Em breve";
  }

  if (textoModal) {
    textoModal.textContent =
      "Esta área está em desenvolvimento e será disponibilizada em breve.";
  }

  abrirModal("modalEmBreve");
}

/* =========================================================
   MAPA
   ========================================================= */

function abrirMapa() {
  const destino = "-11.8015771,-55.4722897";

  const abrirRota = (origem = "") => {
    const origemParametro = origem ? `&origin=${origem}` : "";

    window.open(
      `https://www.google.com/maps/dir/?api=1${origemParametro}&destination=${destino}&travelmode=driving`,
      "_blank"
    );
  };

  if (!navigator.geolocation) {
    abrirRota();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (posicao) => {
      abrirRota(`${posicao.coords.latitude},${posicao.coords.longitude}`);
    },
    () => abrirRota(),
    {
      enableHighAccuracy: false,
      timeout: 6000,
      maximumAge: 300000
    }
  );
}

/* =========================================================
   GALERIA
   ========================================================= */

function abrirFoto(src) {
  const foto = $("#fotoAberta");
  if (!foto) return;

  foto.src = src;
  abrirModal("modalFoto");
}

/* =========================================================
   AJUDA
   ========================================================= */

const AJUDA = [
  {
    pergunta: "Posso comprar ingresso para hoje pelo site?",
    resposta:
      "Não. Compras online devem ser realizadas com pelo menos 1 dia de antecedência. Para uso no mesmo dia, a compra é feita exclusivamente na bilheteria do parque."
  },
  {
    pergunta: "Posso comprar ingresso na bilheteria?",
    resposta:
      "Sim. A bilheteria funciona presencialmente nos dias de abertura do parque."
  },
  {
    pergunta: "Criança paga ingresso?",
    resposta:
      "Crianças de 0 a 4 anos têm entrada gratuita mediante apresentação de documento oficial. De 5 a 11 anos utilizam ingresso Kids. Caso não seja apresentado documento que comprove a idade da criança, será cobrado o valor integral conforme a tabela vigente do dia na bilheteria. A partir de 12 anos, utiliza ingresso Individual."
  },
  {
    pergunta: "Posso levar alimentos e bebidas?",
    resposta:
      "Não é permitida a entrada de alimentos e bebidas no parque. São permitidos apenas água, tereré e chimarrão. Em caso de dúvidas, entre em contato com nossa Central de Atendimento."
  },
  {
    pergunta: "Tem estacionamento?",
    resposta:
      "Sim. O estacionamento do parque é gratuito."
  },
  {
    pergunta: "Tem guarda-volumes?",
    resposta:
      "Sim. Disponibilizamos guarda-volumes no espaço da lanchonete. O serviço possui uma taxa de utilização paga à parte."
  },
  {
    pergunta: "Quais formas de pagamento são aceitas?",
    resposta:
      "Aceitamos PIX, cartões de débito e crédito e a Pulseira de Consumo. Se preferir pagar em dinheiro, basta recarregar sua Pulseira de Consumo no ponto de recarga, anexo à sorveteria, dentro do parque."
  },
  {
    pergunta: "Posso sair e retornar ao parque no mesmo dia?",
    resposta:
      "Sim. Você pode sair e retornar ao parque no mesmo dia, desde que a pulseira de acesso permaneça intacta e devidamente presa ao pulso. Caso a pulseira seja retirada, rompida ou danificada, ela perderá a validade e será necessário adquirir um novo ingresso."
  }
];

function renderizarAjuda() {
  const container = $("#ajudaContainer");
  if (!container) return;

  container.innerHTML = `
    ${AJUDA.map((item, index) => {
      return `
        <button
          class="help-item"
          type="button"
          onclick="abrirResposta(${index})"
        >
          ${item.pergunta}
        </button>

        <div class="help-answer hidden" id="resposta-${index}">
          ${item.resposta}
        </div>
      `;
    }).join("")}

    <div class="help-cta">
      <div class="help-cta-icon">❓</div>

      <div class="help-cta-texto">
        <strong>Ainda com dúvidas?</strong>
        <p>Escolha o assunto e fale conosco pelo WhatsApp.</p>
      </div>

      <div class="help-cta-buttons">
        <button type="button" onclick="abrirWhatsAppAjuda('ingressos')">
          🎟️ Ingressos
        </button>

        <button type="button" onclick="abrirWhatsAppAjuda('acesso')">
          🚪 Acesso ao parque
        </button>

        <button type="button" onclick="abrirWhatsAppAjuda('meia')">
          🎫 Meia-entrada
        </button>

        <button type="button" onclick="abrirWhatsAppAjuda('outros')">
          💬 Outros assuntos
        </button>
      </div>
    </div>
  `;
}

function abrirResposta(index) {
  document.querySelectorAll(".help-answer").forEach((item, i) => {
    if (i === index) {
      item.classList.toggle("hidden");
    } else {
      item.classList.add("hidden");
    }
  });
}

function abrirWhatsAppAjuda(tipo) {
  let mensagem = "";

  switch (tipo) {
    case "ingressos":
      mensagem = "Olá! Tenho dúvidas sobre ingressos.";
      break;

    case "acesso":
      mensagem = "Olá! Tenho dúvidas sobre acesso ao parque.";
      break;

    case "meia":
      mensagem = "Olá! Tenho dúvidas sobre meia-entrada.";
      break;

    default:
      mensagem = "Olá! Tenho uma dúvida e gostaria de falar com a equipe.";
  }

  window.open(
    `https://wa.me/556696454707?text=${encodeURIComponent(mensagem)}`,
    "_blank"
  );
}

/* =========================================================
   IFRAME DE INGRESSOS
   ========================================================= */

function openIngressosModal() {
  const modal = $("#ingressosModal");
  const iframe = $("#iframeIngressos");

  if (!modal) return;

  if (
    iframe &&
    typeof CONFIG !== "undefined" &&
    CONFIG.ingressosOnline
  ) {
    iframe.src = CONFIG.ingressosOnline;
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeIngressosModal() {
  const modal = $("#ingressosModal");

  if (modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
  }
}

/* =========================================================
   ANIMAÇÕES
   ========================================================= */

function ativarAnimacoes() {
  const elementos = document.querySelectorAll(
    ".quick-card, .support-section, .gallery-section"
  );

  elementos.forEach((item, index) => {
    item.style.animationDelay = `${index * 0.06}s`;
    item.classList.add("animar-entrada");
  });
}

/* =========================================================
   BARRA FIXA AO ROLAR
   ========================================================= */

function ativarBarraFixaAoRolar() {
  const barra = $("#barraStatus");
  if (!barra) return;

  let pontoAtivacao = barra.offsetTop;

  const atualizarPonto = () => {
    if (!barra.classList.contains("fixa")) {
      pontoAtivacao = barra.offsetTop;
    }
  };

  const verificarScroll = () => {
    if (window.scrollY >= pontoAtivacao) {
      barra.classList.add("fixa");
    } else {
      barra.classList.remove("fixa");
    }
  };

  window.addEventListener("resize", atualizarPonto);
  window.addEventListener("scroll", verificarScroll, { passive: true });

  verificarScroll();
}

/* =========================================================
   ACORDEÃO DE MEIA-ENTRADA
   ========================================================= */

document.addEventListener("click", (evento) => {
  const cabecalho = evento.target.closest(".accordion-header");

  if (!cabecalho) return;

  const item = cabecalho.closest(".accordion-item");
  if (!item) return;

  document.querySelectorAll(".accordion-item").forEach((accordion) => {
    if (accordion !== item) {
      accordion.classList.remove("active");

      const seta = accordion.querySelector(".accordion-header span");
      if (seta) seta.textContent = "⌄";
    }
  });

  item.classList.toggle("active");

  const seta = item.querySelector(".accordion-header span");

  if (seta) {
    seta.textContent = item.classList.contains("active") ? "⌃" : "⌄";
  }
});

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await carregarParametrosGerais();
    await carregarCalendariosFuncionamento();

    renderizarBarra();
  } catch (erro) {
    console.error("Erro ao carregar dados da planilha:", erro);

    const barra = $("#barraStatus");

    if (barra) {
      barra.innerHTML = `
        <div class="barra-inner barra-fechado">
          <div class="barra-status">
            <strong>⚠️ Dados temporariamente indisponíveis</strong>
            <span>Tente atualizar a página em alguns instantes.</span>
          </div>
        </div>
      `;
    }
  }

  renderizarAjuda();
  ativarAnimacoes();
  ativarBarraFixaAoRolar();

  /*
   * A busca das ofertas ocorre em segundo plano.
   * A página continua utilizável enquanto a consulta é realizada.
   */
  buscarOfertasEspeciais();

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (evento) => {
      if (evento.target === modal) {
        fecharModal(modal.id);
      }
    });
  });

  document.addEventListener("keydown", (evento) => {
    if (evento.key !== "Escape") return;

    const modalAberto = document.querySelector(".modal.open");

    if (modalAberto) {
      fecharModal(modalAberto.id);
      return;
    }

    const iframeModal = $("#ingressosModal");

    if (iframeModal?.classList.contains("active")) {
      closeIngressosModal();
    }
  });
});
