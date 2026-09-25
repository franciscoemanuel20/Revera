import type { ChaveDeTexto } from "@/lib/conteudo/registro";
import { DEFAULT_SITE_LOCALE, type SiteLocale } from "./site";

type TraducoesDeConteudo = Partial<Record<ChaveDeTexto, string>>;

const EN: TraducoesDeConteudo = {
  "trustbar.item1": "Quality checked before shipping",
  "trustbar.item2": "7 business days warranty",

  "home.hero.eyebrow": "Micro skin base 0.08mm",
  "home.hero.titulo": "Hair system with a natural finish",
  "home.hero.subtitulo": "Shipping across Brazil.",
  "home.hero.botaoComprar": "Buy now",
  "home.hero.botaoConhecer": "Explore our hair systems",
  "home.naturalidade.eyebrow": "Natural look",
  "home.naturalidade.titulo": "Real strand-by-strand application",
  "home.naturalidade.texto":
    "A natural result depends not only on the quality of the hair system, but also on the choice of piece, preparation, cut, coloring and techniques used by the professional.",
  "home.micropele.eyebrow": "Micropele line",
  "home.micropele.titulo": "Revera's thinnest line",
  "home.micropele.texto":
    "Ultra-thin base in two thicknesses, 0.08mm and 0.06mm, the thinnest in the line, with a natural front hairline finish. It is Revera's flagship line.",
  "home.micropele.fotoAlt": "Close-up of the Micropele base",
  "home.micropele.linkComProduto": "See details and available colors",
  "home.micropele.linkSemProduto": "See available colors",
  "home.depoimentos.eyebrow": "Customers",
  "home.depoimentos.titulo": "What people say about Revera",
  "home.beneficios.eyebrow": "Why Revera",
  "home.beneficios.titulo": "Made to look like your own hair",
  "home.beneficios.item1.titulo": "Natural finish",
  "home.beneficios.item1.texto": "Front hairline with a natural finish, without a piece-like appearance.",
  "home.beneficios.item2.titulo": "Base by choice",
  "home.beneficios.item2.texto": "Ultra-thin base in 0.08mm or 0.06mm, according to your choice.",
  "home.beneficios.item3.titulo": "Delivered to you",
  "home.beneficios.item3.texto": "Shipping across Brazil, with quality check before dispatch.",
  "home.jornada.eyebrow": "How it works",
  "home.jornada.titulo": "From choice to delivery",
  "home.jornada.passo1.titulo": "Choose color and thickness",
  "home.jornada.passo1.texto": "See the real color chart and choose the base that suits you.",
  "home.jornada.passo2.titulo": "Checkout with calculated shipping",
  "home.jornada.passo2.texto": "Checkout calculates shipping for your postal code before payment.",
  "home.jornada.passo3.titulo": "Receive it at home, with warranty",
  "home.jornada.passo3.texto": "Your piece arrives with a 7-business-day warranty against manufacturing defects.",
  "home.faq.eyebrow": "Questions",
  "home.faq.titulo": "Frequently asked questions",
  "home.ctaFinal.titulo": "Ready to discover the Micropele line?",
  "home.ctaFinal.texto": "Choose your color and complete the order in a few minutes.",
  "home.ctaFinal.botao": "See available colors",

  "cuidados.eyebrow": "Daily care",
  "cuidados.titulo": "Hair system care",
  "cuidados.intro": "Daily care helps the piece last longer and keep its finish.",
  "cuidados.bloco1.titulo": "Washing",
  "cuidados.bloco1.texto":
    "Wash the hair 1 to 2 times per week with salt-free conditioner. On the other days, use a shower cap over the hair system; the sides of your natural hair can be washed normally.",
  "cuidados.bloco2.titulo": "Heat",
  "cuidados.bloco2.texto": "Do not use a flat iron. Use a hair dryer only on cool or warm air.",
  "cuidados.bloco3.titulo": "Grey hair systems",
  "cuidados.bloco3.texto":
    "Grey hair systems up to 50% use synthetic strands so the toning process does not alter the white strands.",

  "naturalidade.eyebrow": "The most common question",
  "naturalidade.titulo": "Will it look artificial?",
  "naturalidade.citacao":
    "\"A natural result depends not only on the quality of the hair system, but also on the choice of piece, preparation, cut, coloring and techniques used by the professional.\"",
  "naturalidade.video.legenda": "Real video of the hair system application process.",
  "naturalidade.video.fallback": "Your browser cannot play this video.",
  "naturalidade.influencia.titulo": "What really shapes the result",
  "naturalidade.influencia.texto":
    "Naturalness is not a single product feature. It is the sum of six factors. A quality piece alone does not compensate for a poor cut, and a good cut does not compensate for the wrong piece.",
  "naturalidade.fator1.titulo": "The piece",
  "naturalidade.fator1.texto":
    "The quality of the base and hair is the starting point, but only the starting point. A well-made piece still depends on everything below for the final result.",
  "naturalidade.fator2.titulo": "Choosing the right piece",
  "naturalidade.fator2.texto":
    "Base thickness and hair color need to match the wearer. The same piece can read differently in different situations.",
  "naturalidade.fator3.titulo": "Preparation",
  "naturalidade.fator3.texto":
    "How the base is prepared before application, including molding and fitting it to the head shape, directly affects how the piece sits.",
  "naturalidade.fator4.titulo": "Cut",
  "naturalidade.fator4.texto":
    "A poor cut draws attention even on an excellent base. It is manual professional work, done piece by piece.",
  "naturalidade.fator5.titulo": "Coloring",
  "naturalidade.fator5.texto":
    "Matching the strand tone to the roots and remaining hair, when present, is what avoids a visible contrast at the transition line.",
  "naturalidade.fator6.titulo": "Application technique",
  "naturalidade.fator6.texto":
    "The same material applied with different techniques produces different results. This part depends entirely on the professional, not only on the product.",
  "naturalidade.aviso":
    "We do not use before-and-after photos. The result depends on the piece choice, application and cut. Another person's photo would promise an effect outside our control, so we prefer to show the real process and explain what truly matters.",

  "sobre.eyebrow": "For first-time users",
  "sobre.titulo": "What is a hair system",
  "sobre.intro":
    "A simple guide, without unexplained technical terms, to understand what the piece is made of and what changes from one base to another.",
  "sobre.oQueE.titulo": "What it is",
  "sobre.oQueE.texto":
    "A hair system is a piece made with strands applied to a base that is fixed to the scalp. The base supports the hair exactly where hair is missing, so its appearance matters as much as the strands themselves.",
  "sobre.oQueEABase.titulo": "What the base is",
  "sobre.oQueEABase.texto":
    "The base is the membrane where each strand is fixed one by one. It touches the scalp and gives the piece its shape. The thickness of this membrane, measured in millimeters, is the main technical number used when talking about hair systems.",
  "sobre.fotosBase.alt1": "Revera hair system base seen from above, with hair around it",
  "sobre.fotosBase.alt2": "Close-up of the base, showing the membrane where each strand is fixed",
  "sobre.fotosBase.alt3": "Double-knot illustration, the finish that gives the piece more durability",
  "sobre.basesFinas.titulo": "Thinner and thicker bases",
  "sobre.basesFinas.texto":
    "In general, the thinner the base, the more discreet it tends to look on the skin, especially near the front hairline. A thicker base tends to resist daily handling better. This trade-off between discretion and resistance is the general logic behind different hair system thicknesses.",
  "sobre.medida008.titulo": "What 0.08mm and 0.06mm mean",
  "sobre.medida008.texto":
    "This is the base thickness, measured in millimeters. The smaller the number, the thinner the membrane. Revera offers the Micropele line in two thicknesses: 0.08mm, with a natural front hairline finish, and 0.06mm, the thinnest in the line.",
  "sobre.grisalhos.titulo": "Grey hair",
  "sobre.grisalhos.texto":
    "Grey hair systems up to 50% use synthetic strands so the toning process does not alter the white strands.",

  "garantia.eyebrow": "After-sales",
  "garantia.titulo": "Warranty",
  "garantia.intro":
    "Before shipping, every hair system goes through a quality check. Even so, the deciding check is yours, and it happens as soon as the piece arrives, before cutting, molding or gluing.",
  "garantia.teste.titulo": "The strand test",
  "garantia.passo1": "Place a light-colored cloth under the piece so you can see any strands that come loose.",
  "garantia.passo2": "Run your hand gently over the hair. Do not pull or squeeze.",
  "garantia.passo3":
    "It is normal for a few strands to come loose at first. These are loose strands from production that were not attached to the base.",
  "garantia.passo4":
    "Continue for about one minute. Then run your hand again and check the cloth: shedding should have stopped.",
  "garantia.passo5.antes": "If strands are still falling after that minute,",
  "garantia.passo5.destaque": "stop there",
  "garantia.passo5.depois":
    ". Do not cut, shape or glue it. Contact us with the piece exactly as it arrived.",
  "garantia.troca.titulo": "Until when an exchange is possible",
  "garantia.troca.p1":
    "As long as the piece is still as it arrived, without cutting, styling or glue, it can be returned and exchanged for another one.",
  "garantia.troca.p2":
    "After it has been cut, shaped and glued to the head, the hair system cannot return to the condition in which it was shipped. It has been adjusted for one person only. From that point on, there is no return or exchange due to strand shedding, which is why the test above is your responsibility and comes before anything else.",
  "garantia.troca.aviso":
    "One minute running your hand over the strands before scissors touch the piece is what separates a simple exchange from a piece that can no longer be returned.",
  "garantia.prazos.titulo": "Deadlines",
  "garantia.prazos.defeito.antes": "You have",
  "garantia.prazos.defeito.prazo": "7 business days",
  "garantia.prazos.defeito.depois":
    "from receipt to report a manufacturing defect, and the strand test is exactly what reveals this on the first day.",
  "garantia.prazos.desistir.antes": "Changed your mind? You may withdraw from the purchase within",
  "garantia.prazos.desistir.prazo": "7 days",
  "garantia.prazos.desistir.depois":
    "of receipt, with the piece unused and unchanged. Just contact us.",
  "garantia.prazos.cuidados.antes":
    "Durability after that depends on daily care. What to use, how to wash and what to avoid is explained in",
  "garantia.prazos.cuidados.link": "Care",

  "porque.eyebrow": "Trust",
  "porque.titulo": "Why Revera",
  "porque.bloco1.titulo": "Quality check before shipping",
  "porque.bloco1.texto":
    "Before shipping, every hair system goes through a strict quality check to make sure the product is delivered in proper condition.",
  "porque.bloco2.titulo": "Color variety",
  "porque.bloco2.texto": "The Micropele line is available in 15 colors, including grey shades. See all options in",
  "porque.bloco2.link": "/colors",
  "porque.bloco3.titulo": "Color guidance",
  "porque.bloco3.texto":
    "Send a photo of your natural hair and our team will indicate the closest available color. The tool is on the",
  "porque.bloco3.link": "colors page",
  "porque.bloco4.titulo": "Shipping across Brazil",
  "porque.bloco4.texto": "Shipping is calculated by postal code at checkout, for any location in the country.",
  "porque.bloco5.titulo": "Warranty",
  "porque.bloco5.texto":
    "After receiving the hair system, the customer has up to 7 business days to report any possible manufacturing defect. See the details in",
  "porque.bloco5.link": "warranty",

  "profissionais.eyebrow": "Barbers and professionals",
  "profissionais.titulo": "For professionals",
  "profissionais.intro":
    "Revera works with professionals who use hair systems, including interest in volume purchasing.",
  "profissionais.comoFunciona.titulo": "How it works",
  "profissionais.comoFunciona.texto":
    "Leave your details below and tell us a little about your work volume. Our team will contact you to present the conditions. Price, deadline and volume purchase format are handled directly in that conversation, with no fixed public price here.",
  "profissionais.cadastro.titulo": "Registration",
  "profissionais.campo.nome.rotulo": "Name",
  "profissionais.campo.telefone.rotulo": "Phone",
  "profissionais.campo.telefone.dica": "Include country/area code.",
  "profissionais.campo.email.rotulo": "Email",
  "profissionais.campo.email.dica": "Optional.",
  "profissionais.campo.empresa.rotulo": "Salon or barbershop name",
  "profissionais.campo.empresa.dica": "Optional.",
  "profissionais.campo.cidade.rotulo": "City",
  "profissionais.campo.cidade.dica": "Optional.",
  "profissionais.campo.mensagem.rotulo": "Message",
  "profissionais.campo.mensagem.dica": "Tell us a little about your volume. Optional.",
  "profissionais.botao.enviar": "I want to be contacted",
  "profissionais.whatsapp.botao": "Talk on WhatsApp now",
  "profissionais.whatsapp.dica":
    "The conversation opens in a new tab. If it does not open, tap the button or message the number below.",
  "profissionais.whatsapp.telefoneRotulo": "WhatsApp",
  "profissionais.mensagemSucesso": "We received your contact. Our team will get in touch to present the conditions.",
};

const ES: TraducoesDeConteudo = {
  "trustbar.item1": "Control de calidad antes del envio",
  "trustbar.item2": "7 dias habiles de garantia",

  "home.hero.eyebrow": "Base micropele 0,08mm",
  "home.hero.titulo": "Protesis capilar con acabado natural",
  "home.hero.subtitulo": "Envio a todo Brasil.",
  "home.hero.botaoComprar": "Comprar ahora",
  "home.hero.botaoConhecer": "Conoce nuestras protesis",
  "home.naturalidade.eyebrow": "Naturalidad",
  "home.naturalidade.titulo": "Implantacion real, cabello por cabello",
  "home.naturalidade.texto":
    "La naturalidad del resultado no depende solo de la calidad de la protesis, sino tambien de la eleccion de la pieza, preparacion, corte, coloracion y tecnicas utilizadas por el profesional.",
  "home.micropele.eyebrow": "Linea micropele",
  "home.micropele.titulo": "La linea mas fina de Revera",
  "home.micropele.texto":
    "Base ultrafina en dos grosores, 0,08mm y 0,06mm, la mas fina de la linea, con acabado natural en la linea frontal. Es la linea principal de Revera.",
  "home.micropele.fotoAlt": "Primer plano de la base Micropele",
  "home.micropele.linkComProduto": "Ver detalles y colores disponibles",
  "home.micropele.linkSemProduto": "Ver colores disponibles",
  "home.depoimentos.eyebrow": "Quien ya usa",
  "home.depoimentos.titulo": "Lo que dicen sobre Revera",
  "home.beneficios.eyebrow": "Por que Revera",
  "home.beneficios.titulo": "Hecha para parecer tu propio cabello",
  "home.beneficios.item1.titulo": "Acabado natural",
  "home.beneficios.item1.texto": "Linea frontal con acabado natural, sin apariencia de pieza.",
  "home.beneficios.item2.titulo": "Base segun tu eleccion",
  "home.beneficios.item2.texto": "Base ultrafina en 0,08mm o 0,06mm, segun tu eleccion.",
  "home.beneficios.item3.titulo": "Llega a casa",
  "home.beneficios.item3.texto": "Envio a todo Brasil, con control de calidad antes de salir.",
  "home.jornada.eyebrow": "Como funciona",
  "home.jornada.titulo": "De la eleccion a la entrega",
  "home.jornada.passo1.titulo": "Elige color y grosor",
  "home.jornada.passo1.texto": "Mira la carta real y elige la base que combina contigo.",
  "home.jornada.passo2.titulo": "Finaliza con envio calculado",
  "home.jornada.passo2.texto": "El checkout calcula el envio para tu codigo postal antes de pagar.",
  "home.jornada.passo3.titulo": "Recibe en casa, con garantia",
  "home.jornada.passo3.texto": "Tu pieza llega con 7 dias habiles de garantia contra defecto de fabricacion.",
  "home.faq.eyebrow": "Dudas",
  "home.faq.titulo": "Preguntas frecuentes",
  "home.ctaFinal.titulo": "Lista para conocer la linea Micropele?",
  "home.ctaFinal.texto": "Elige tu color y finaliza el pedido en pocos minutos.",
  "home.ctaFinal.botao": "Ver colores disponibles",

  "cuidados.eyebrow": "Cuidados diarios",
  "cuidados.titulo": "Cuidados de la protesis",
  "cuidados.intro": "Los cuidados diarios ayudan a que la pieza dure mas y mantenga su acabado.",
  "cuidados.bloco1.titulo": "Lavado",
  "cuidados.bloco1.texto":
    "Lava los cabellos de 1 a 2 veces por semana, con acondicionador sin sal. En los otros dias, usa gorro de ducha sobre la protesis; los laterales de tu cabello natural pueden lavarse normalmente.",
  "cuidados.bloco2.titulo": "Calor",
  "cuidados.bloco2.texto": "No uses plancha. El secador debe usarse solo en modo frio o tibio.",
  "cuidados.bloco3.titulo": "Protesis con canas",
  "cuidados.bloco3.texto":
    "Las protesis con canas de hasta 50% tienen fibras sinteticas para permitir el proceso de tonalizacion sin alterar los cabellos blancos.",

  "naturalidade.eyebrow": "La pregunta mas comun",
  "naturalidade.titulo": "Se vera artificial?",
  "naturalidade.citacao":
    "\"La naturalidad del resultado no depende solo de la calidad de la protesis, sino tambien de la eleccion de la pieza, preparacion, corte, coloracion y tecnicas utilizadas por el profesional.\"",
  "naturalidade.video.legenda": "Video real del proceso de implantacion de la protesis.",
  "naturalidade.video.fallback": "Tu navegador no reproduce este video.",
  "naturalidade.influencia.titulo": "Lo que realmente influye en el resultado",
  "naturalidade.influencia.texto":
    "La naturalidad no es una sola caracteristica del producto. Es la suma de seis factores. Una pieza de calidad no compensa por si sola un mal corte, y un buen corte no compensa una pieza equivocada para el caso.",
  "naturalidade.fator1.titulo": "La pieza",
  "naturalidade.fator1.texto":
    "La calidad de la base y del cabello es el punto de partida, pero solo el punto de partida. Una pieza bien hecha todavia depende de todo lo siguiente para el resultado final.",
  "naturalidade.fator2.titulo": "Elegir la pieza correcta",
  "naturalidade.fator2.texto":
    "El grosor de la base y el color del cabello deben combinar con la persona que la usara. La misma pieza puede verse diferente en situaciones distintas.",
  "naturalidade.fator3.titulo": "Preparacion",
  "naturalidade.fator3.texto":
    "La forma en que la base se prepara antes de la aplicacion, incluyendo moldeado y ajuste al formato de la cabeza, influye directamente en la caida de la pieza.",
  "naturalidade.fator4.titulo": "Corte",
  "naturalidade.fator4.texto":
    "Un mal corte llama la atencion incluso en una base excelente. Es trabajo manual del profesional, hecho pieza por pieza.",
  "naturalidade.fator5.titulo": "Coloracion",
  "naturalidade.fator5.texto":
    "Ajustar el tono del cabello a la raiz y al resto del cabello, cuando existe, evita un contraste visible en la linea de transicion.",
  "naturalidade.fator6.titulo": "Tecnica de aplicacion",
  "naturalidade.fator6.texto":
    "El mismo material aplicado con tecnicas diferentes produce resultados diferentes. Esta parte depende enteramente del profesional, no solo del producto.",
  "naturalidade.aviso":
    "No usamos fotos de antes y despues. El resultado depende de la eleccion de la pieza, la implantacion y el corte. La foto de otra persona prometeria un efecto que no esta bajo nuestro control; preferimos mostrar el proceso real y explicar lo que de verdad importa.",

  "sobre.eyebrow": "Para quien nunca uso",
  "sobre.titulo": "Que es una protesis capilar",
  "sobre.intro":
    "Una guia simple, sin terminos tecnicos sin explicacion, para entender de que esta hecha la pieza y que cambia de una base a otra.",
  "sobre.oQueE.titulo": "Que es",
  "sobre.oQueE.texto":
    "La protesis capilar es una pieza hecha con cabellos aplicados a una base que se fija al cuero cabelludo. La base sostiene los cabellos exactamente donde ya no hay cabello, por eso su apariencia importa tanto como los cabellos en si.",
  "sobre.oQueEABase.titulo": "Que es la base",
  "sobre.oQueEABase.texto":
    "La base es la membrana donde cada cabello se fija uno por uno. Queda en contacto con el cuero cabelludo y da forma a la pieza. El grosor de esa membrana, medido en milimetros, es el principal dato tecnico al hablar de protesis capilares.",
  "sobre.fotosBase.alt1": "Base de protesis capilar Revera vista desde arriba, con cabellos alrededor",
  "sobre.fotosBase.alt2": "Primer plano de la base, mostrando la membrana donde cada cabello se fija",
  "sobre.fotosBase.alt3": "Ilustracion del nudo doble, el acabado que da mas durabilidad a la pieza",
  "sobre.basesFinas.titulo": "Bases mas finas y mas gruesas",
  "sobre.basesFinas.texto":
    "En general, cuanto mas fina la base, mas discreta tiende a verse sobre la piel, especialmente en la linea frontal. Una base mas gruesa tiende a resistir mejor el manejo diario. Ese equilibrio entre discrecion y resistencia es la logica general detras de los distintos grosores.",
  "sobre.medida008.titulo": "Que significan 0,08mm y 0,06mm",
  "sobre.medida008.texto":
    "Es la medida del grosor de la base, en milimetros. Cuanto menor el numero, mas fina la membrana. Revera trabaja la linea Micropele en dos grosores: 0,08mm, con acabado natural en la linea frontal, y 0,06mm, la mas fina de la linea.",
  "sobre.grisalhos.titulo": "Cabellos con canas",
  "sobre.grisalhos.texto":
    "Las protesis con canas de hasta 50% tienen fibras sinteticas para permitir el proceso de tonalizacion sin alterar los cabellos blancos.",

  "garantia.eyebrow": "Postventa",
  "garantia.titulo": "Garantia",
  "garantia.intro":
    "Antes del envio, cada protesis pasa por una revision de calidad. Aun asi, la prueba decisiva es la tuya, y se hace en cuanto la pieza llega, antes de cortar, moldear o pegar.",
  "garantia.teste.titulo": "La prueba de los cabellos",
  "garantia.passo1": "Coloca un paño claro debajo de la pieza para ver cualquier cabello que se suelte.",
  "garantia.passo2": "Pasa la mano sobre los cabellos con suavidad. Sin tirar, sin apretar.",
  "garantia.passo3":
    "Es normal que se suelten algunos cabellos al comienzo. Son cabellos sueltos de la confeccion que no estaban fijados en la base.",
  "garantia.passo4":
    "Continua cerca de un minuto. Despues, pasa la mano otra vez y mira el paño: la caida debe haber parado.",
  "garantia.passo5.antes": "Si todavia caen cabellos despues de ese minuto,",
  "garantia.passo5.destaque": "detente ahi",
  "garantia.passo5.depois":
    ". No cortes, no moldees, no pegues. Habla con nosotros con la pieza exactamente como llego.",
  "garantia.troca.titulo": "Hasta cuando se puede cambiar",
  "garantia.troca.p1":
    "Mientras la pieza esta como llego, sin corte, sin moldeado y sin pegamento, puede devolverse y cambiarse por otra.",
  "garantia.troca.p2":
    "Despues de cortada, moldeada y pegada en la cabeza, la protesis no vuelve al estado en que fue enviada. Fue ajustada para una sola persona. Desde ahi no hay devolucion ni cambio por caida de cabellos, por eso la prueba anterior es tu responsabilidad y viene antes de cualquier otra cosa.",
  "garantia.troca.aviso":
    "Un minuto pasando la mano por los cabellos antes de la tijera separa un cambio simple de una pieza que ya no puede volver.",
  "garantia.prazos.titulo": "Plazos",
  "garantia.prazos.defeito.antes": "Tienes",
  "garantia.prazos.defeito.prazo": "7 dias habiles",
  "garantia.prazos.defeito.depois":
    "desde la recepcion para comunicar un defecto de fabricacion; la prueba de los cabellos es justamente lo que lo revela el primer dia.",
  "garantia.prazos.desistir.antes": "Cambiaste de idea? Puedes desistir de la compra hasta",
  "garantia.prazos.desistir.prazo": "7 dias",
  "garantia.prazos.desistir.depois":
    "despues de recibirla, con la pieza sin uso y sin alteraciones. Solo habla con nosotros.",
  "garantia.prazos.cuidados.antes":
    "La durabilidad despues de eso depende de los cuidados diarios. Que usar, como lavar y que evitar esta en",
  "garantia.prazos.cuidados.link": "Cuidados",

  "porque.eyebrow": "Confianza",
  "porque.titulo": "Por que Revera",
  "porque.bloco1.titulo": "Control de calidad antes del envio",
  "porque.bloco1.texto":
    "Antes del envio, todas las protesis pasan por una revision rigurosa de calidad para asegurar que el producto se entregue en buenas condiciones.",
  "porque.bloco2.titulo": "Variedad de colores",
  "porque.bloco2.texto": "La linea Micropele esta disponible en 15 colores, incluyendo tonos con canas. Mira todas las opciones en",
  "porque.bloco2.link": "/colores",
  "porque.bloco3.titulo": "Ayuda para elegir el color",
  "porque.bloco3.texto":
    "Envia una foto de tu cabello natural y nuestro equipo indicara el color mas parecido entre las opciones disponibles. La herramienta esta en la pagina de",
  "porque.bloco3.link": "colores",
  "porque.bloco4.titulo": "Envio a todo Brasil",
  "porque.bloco4.texto": "El envio se calcula por codigo postal al finalizar el pedido, para cualquier lugar del pais.",
  "porque.bloco5.titulo": "Garantia",
  "porque.bloco5.texto":
    "Despues de recibir la protesis, el cliente tiene hasta 7 dias habiles para comunicar cualquier posible defecto de fabricacion. Mira los detalles en",
  "porque.bloco5.link": "garantia",

  "profissionais.eyebrow": "Barberos y profesionales",
  "profissionais.titulo": "Para profesionales",
  "profissionais.intro":
    "Revera atiende a profesionales que trabajan con protesis capilares, incluyendo interes en compra por volumen.",
  "profissionais.comoFunciona.titulo": "Como funciona",
  "profissionais.comoFunciona.texto":
    "Deja tus datos abajo y cuentanos un poco sobre tu volumen de trabajo. Nuestro equipo entra en contacto para presentar las condiciones. Precio, plazo y forma de compra por cantidad se tratan directamente en esa conversacion, sin precio fijo publicado aqui.",
  "profissionais.cadastro.titulo": "Registro",
  "profissionais.campo.nome.rotulo": "Nombre",
  "profissionais.campo.telefone.rotulo": "Telefono",
  "profissionais.campo.telefone.dica": "Con codigo de area.",
  "profissionais.campo.email.rotulo": "Email",
  "profissionais.campo.email.dica": "Opcional.",
  "profissionais.campo.empresa.rotulo": "Nombre del salon o barberia",
  "profissionais.campo.empresa.dica": "Opcional.",
  "profissionais.campo.cidade.rotulo": "Ciudad",
  "profissionais.campo.cidade.dica": "Opcional.",
  "profissionais.campo.mensagem.rotulo": "Mensaje",
  "profissionais.campo.mensagem.dica": "Cuenta un poco sobre el volumen con el que trabajas. Opcional.",
  "profissionais.botao.enviar": "Quiero que me contacten",
  "profissionais.whatsapp.botao": "Hablar por WhatsApp ahora",
  "profissionais.whatsapp.dica":
    "La conversacion se abre en una nueva pestaña. Si no se abre, toca el boton o escribe directamente al numero de abajo.",
  "profissionais.whatsapp.telefoneRotulo": "WhatsApp",
  "profissionais.mensagemSucesso": "Recibimos tu contacto. Nuestro equipo se pondra en contacto para presentar las condiciones.",
};

const FR: TraducoesDeConteudo = {
  "trustbar.item1": "Controle qualite avant expedition",
  "trustbar.item2": "Garantie de 7 jours ouvrables",

  "garantia.eyebrow": "Apres-vente",
  "garantia.titulo": "Garantie",
  "garantia.intro":
    "Avant expedition, chaque prothese capillaire passe par un controle qualite. Mais la verification decisive est la votre, des que la piece arrive, avant coupe, ajustement ou collage.",
  "garantia.teste.titulo": "Le test des cheveux",
  "garantia.passo1": "Placez un tissu clair sous la piece pour voir les cheveux qui pourraient se detacher.",
  "garantia.passo2": "Passez doucement la main sur les cheveux. Ne tirez pas et ne serrez pas.",
  "garantia.passo3":
    "Il est normal que quelques cheveux se detachent au debut. Ce sont des cheveux libres de la fabrication, non fixes a la base.",
  "garantia.passo4":
    "Continuez pendant environ une minute. Repassez ensuite la main et verifiez le tissu : la chute doit s'etre arretee.",
  "garantia.passo5.antes": "Si des cheveux continuent a tomber apres cette minute,",
  "garantia.passo5.destaque": "arretez-vous la",
  "garantia.passo5.depois":
    ". Ne coupez pas, n'ajustez pas et ne collez pas. Contactez-nous avec la piece exactement comme elle est arrivee.",
  "garantia.troca.titulo": "Jusqu'a quand l'echange est possible",
  "garantia.troca.p1":
    "Tant que la piece est dans l'etat ou elle est arrivee, sans coupe, coiffage ni colle, elle peut etre retournee et echangee.",
  "garantia.troca.p2":
    "Apres coupe, ajustement et collage sur la tete, la prothese ne peut plus revenir a l'etat d'expedition. Elle a ete adaptee a une seule personne. A partir de ce moment, il n'y a plus de retour ni d'echange pour chute de cheveux; c'est pourquoi le test ci-dessus est de votre responsabilite et doit venir avant tout.",
  "garantia.troca.aviso":
    "Une minute a passer la main sur les cheveux avant que les ciseaux touchent la piece separe un echange simple d'une piece qui ne peut plus etre retournee.",
  "garantia.prazos.titulo": "Delais",
  "garantia.prazos.defeito.antes": "Vous avez",
  "garantia.prazos.defeito.prazo": "7 jours ouvrables",
  "garantia.prazos.defeito.depois":
    "a partir de la reception pour signaler un defaut de fabrication; le test des cheveux est exactement ce qui le revele le premier jour.",
  "garantia.prazos.desistir.antes": "Vous avez change d'avis ? Vous pouvez vous retracter jusqu'a",
  "garantia.prazos.desistir.prazo": "7 jours",
  "garantia.prazos.desistir.depois":
    "apres reception, avec la piece non utilisee et non modifiee. Il suffit de nous contacter.",
  "garantia.prazos.cuidados.antes":
    "La durabilite ensuite depend de l'entretien quotidien. Ce qu'il faut utiliser, comment laver et quoi eviter est explique dans",
  "garantia.prazos.cuidados.link": "Entretien",

  "porque.eyebrow": "Confiance",
  "porque.titulo": "Pourquoi Revera",
  "porque.bloco1.titulo": "Controle qualite avant expedition",
  "porque.bloco1.texto":
    "Avant expedition, chaque prothese capillaire passe par un controle qualite rigoureux pour assurer que le produit arrive en bon etat.",
  "porque.bloco2.titulo": "Variete de couleurs",
  "porque.bloco2.texto": "La ligne Micropele est disponible en 15 couleurs, y compris des tons gris. Voir toutes les options dans",
  "porque.bloco2.link": "couleurs",
  "porque.bloco3.titulo": "Aide au choix de couleur",
  "porque.bloco3.texto":
    "Envoyez une photo de vos cheveux naturels et notre equipe indiquera la couleur disponible la plus proche. L'outil se trouve sur la page",
  "porque.bloco3.link": "couleurs",
  "porque.bloco4.titulo": "Livraison dans tout le Bresil",
  "porque.bloco4.texto": "La livraison est calculee par code postal au checkout, pour toute destination dans le pays.",
  "porque.bloco5.titulo": "Garantie",
  "porque.bloco5.texto":
    "Apres reception de la prothese capillaire, le client dispose de 7 jours ouvrables pour signaler un possible defaut de fabrication. Voir les details dans",
  "porque.bloco5.link": "garantie",
};

const DE: TraducoesDeConteudo = {
  "trustbar.item1": "Qualitatskontrolle vor dem Versand",
  "trustbar.item2": "7 Werktage Garantie",

  "garantia.eyebrow": "Nach dem Kauf",
  "garantia.titulo": "Garantie",
  "garantia.intro":
    "Vor dem Versand wird jedes Haarsystem gepruft. Die entscheidende Kontrolle liegt dennoch bei Ihnen und erfolgt direkt nach Erhalt, vor Schneiden, Formen oder Kleben.",
  "garantia.teste.titulo": "Der Haartest",
  "garantia.passo1": "Legen Sie ein helles Tuch unter das System, damit lose Haare sichtbar werden.",
  "garantia.passo2": "Streichen Sie sanft mit der Hand uber das Haar. Nicht ziehen und nicht drucken.",
  "garantia.passo3":
    "Einige lose Haare am Anfang sind normal. Das sind Produktionshaare, die nicht an der Basis befestigt waren.",
  "garantia.passo4":
    "Machen Sie etwa eine Minute weiter. Streichen Sie danach erneut uber das Haar und prufen Sie das Tuch: Der Haarausfall sollte aufgehort haben.",
  "garantia.passo5.antes": "Wenn nach dieser Minute weiterhin Haare ausfallen,",
  "garantia.passo5.destaque": "stoppen Sie hier",
  "garantia.passo5.depois":
    ". Nicht schneiden, nicht formen, nicht kleben. Kontaktieren Sie uns mit dem System genau in dem Zustand, in dem es angekommen ist.",
  "garantia.troca.titulo": "Bis wann ein Umtausch moglich ist",
  "garantia.troca.p1":
    "Solange das System im Ankunftszustand ist, ohne Schnitt, Styling oder Kleber, kann es zuruckgegeben und gegen ein anderes getauscht werden.",
  "garantia.troca.p2":
    "Nachdem es geschnitten, angepasst und am Kopf verklebt wurde, kann das Haarsystem nicht mehr in den Versandzustand zuruck. Es wurde fur eine einzelne Person angepasst. Ab diesem Moment gibt es keine Ruckgabe oder keinen Umtausch wegen Haarausfall; deshalb liegt der obige Test in Ihrer Verantwortung und muss vor allem anderen erfolgen.",
  "garantia.troca.aviso":
    "Eine Minute mit der Hand uber die Haare zu streichen, bevor eine Schere das System beruhrt, trennt einen einfachen Umtausch von einem System, das nicht mehr zuruckgegeben werden kann.",
  "garantia.prazos.titulo": "Fristen",
  "garantia.prazos.defeito.antes": "Sie haben",
  "garantia.prazos.defeito.prazo": "7 Werktage",
  "garantia.prazos.defeito.depois":
    "ab Erhalt, um einen Herstellungsfehler zu melden; genau dafur ist der Haartest am ersten Tag da.",
  "garantia.prazos.desistir.antes": "Meinung geandert? Sie konnen bis zu",
  "garantia.prazos.desistir.prazo": "7 Tage",
  "garantia.prazos.desistir.depois":
    "nach Erhalt vom Kauf zurucktreten, solange das System unbenutzt und unverandert ist. Kontaktieren Sie uns einfach.",
  "garantia.prazos.cuidados.antes":
    "Die Haltbarkeit danach hangt von der taglichen Pflege ab. Was zu verwenden ist, wie man wascht und was zu vermeiden ist, steht unter",
  "garantia.prazos.cuidados.link": "Pflege",

  "porque.eyebrow": "Vertrauen",
  "porque.titulo": "Warum Revera",
  "porque.bloco1.titulo": "Qualitatskontrolle vor dem Versand",
  "porque.bloco1.texto":
    "Vor dem Versand wird jedes Haarsystem streng gepruft, damit das Produkt in gutem Zustand geliefert wird.",
  "porque.bloco2.titulo": "Farbvielfalt",
  "porque.bloco2.texto": "Die Micropele-Linie ist in 15 Farben erhaltlich, einschliesslich Grautonen. Alle Optionen finden Sie unter",
  "porque.bloco2.link": "Farben",
  "porque.bloco3.titulo": "Hilfe bei der Farbauswahl",
  "porque.bloco3.texto":
    "Senden Sie ein Foto Ihres naturlichen Haares und unser Team empfiehlt die nachste verfugbare Farbe. Das Tool befindet sich auf der Seite",
  "porque.bloco3.link": "Farben",
  "porque.bloco4.titulo": "Versand in ganz Brasilien",
  "porque.bloco4.texto": "Der Versand wird beim Checkout per Postleitzahl berechnet, fur jeden Ort im Land.",
  "porque.bloco5.titulo": "Garantie",
  "porque.bloco5.texto":
    "Nach Erhalt des Haarsystems hat der Kunde bis zu 7 Werktage Zeit, einen moglichen Herstellungsfehler zu melden. Details finden Sie unter",
  "porque.bloco5.link": "Garantie",
};

const TRADUCOES: Record<"en" | "es" | "fr" | "de", TraducoesDeConteudo> = {
  en: EN,
  es: ES,
  fr: FR,
  de: DE,
};

export function traducaoDeConteudo(chave: ChaveDeTexto, locale: SiteLocale): string | null {
  if (locale === "pt") return null;
  return TRADUCOES[locale][chave] ?? null;
}
