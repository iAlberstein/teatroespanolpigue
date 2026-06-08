import salaPrincipalFrente from '../assets/images/salas/sala_principal_frente.jpg';
import salaPrincipalEscenario from '../assets/images/salas/sala_principal_desdeescenario.jpg';
import salaPrincipalPalcos from '../assets/images/salas/sala_principal_desdepalcos.jpg';
import tabladoFrente from '../assets/images/salas/eltablado_frente.jpg';
import tabladoMultifrente from '../assets/images/salas/eltablado_multifrente.png';
import gemelasProvisorio from '../assets/images/salas/lasgemelas_provisorio.jpg';

export const salasData = [
  {
    id: 'sala_principal',
    nombre: 'Sala Principal',
    descripcion:
      'El corazón histórico del Teatro Español Pigüé. con su clásico formato en herradura, cuenta con palcos altos y bajos, palcos laterales y platea. Su extraordinaria acústica lo ha consolidado como un espacio de referencia para la cultura y las artes escénicas.',
    capacidad: 446,
    imagenes: [
      salaPrincipalFrente,
      salaPrincipalEscenario,
      salaPrincipalPalcos
    ],
    medidas: {
      bocaEscena: '8 m',
      profundidad: '6 m',
      altura: '6 m',
    },
    tecnica: {
      sonido: ['PA: Bafle activo SA315+ Audiocenter 2000w (x4), adaptables para configurar 2 frentes y 2 monitores', 'Consola analógica Behringer. (8 canales)', '1 Mic shure SV200.', 'Pachera en escenario con manguera a cabina de 16 canales + 8 envios'],
      iluminacion: ['18 PAR 64 110 seriados', '5 Fresnel 1000w', '8 Nebula 6 led par', '6 moviles Kolortec Beasty', 'Maquina de humo/niebla Steam Faze 1000 Neo'],
      escenario: ['3 patas de cada lado', 'pasillo de fondo con señalización lumínica', 'escalera de frente removible', 'conexión rápida a camarines'],
      extras: ['3 varas de luces motorizadas', 'telones de frente: guillotina histórico y americano de pana verde', 'acceso de escenotécnia directo al escenario por puerta trasera']
    }
  },
  {
    id: 'el_tablado',
    nombre: 'El Tablado',
    descripcion:
      'Pensado para teatro independiente/alternativo, obras contemporáneas, monólogos y pequeños formatos. El público abraza al escenario y cada función se vuelve una experiencia cercana, íntima.',
    capacidad: 50,
    imagenes: [
      tabladoFrente,
      tabladoMultifrente
    ],
    medidas: {
      bocaEscena: 'variable',
      profundidad: 'variable',
      altura: '6 m',
    },
    tecnica: {
      sonido: ['PA: Bafle activo SA315+ Audiocenter 2000w (x4), adaptables para configurar 2 frentes y 2 monitores', 'Consola analógica Behringer. (8 canales)', '1 Mic shure SV200.', 'Pachera en escenario con manguera a cabina de 16 canales + 8 envios'],
      iluminacion: ['18 PAR 64 110 seriados', '5 Fresnel 1000w', '8 Nebula 6 led par', '6 moviles Kolortec Beasty', 'Maquina de humo/niebla Steam Faze 1000 Neo'],
      escenario: ['adaptable a diferentes configuraciones', 'conexión rápida a camarines'],
      extras: ['3 varas de luces motorizadas', 'acceso de escenotécnia directo al escenario por puerta trasera']
    }
  },
  {
    id: 'las_gemelas',
    nombre: 'Nueva sala',
    descripcion:
      'PRÓXIMAMENTE',
    capacidad: 70,
    imagenes: [
      gemelasProvisorio
    ],
    medidas: {
      bocaEscena: '8 m',
      profundidad: '8 m',
      altura: '6 m',
    },
    tecnica: {
      sonido: ['Bafle activo SA315+ Audiocenter 2000w (x4)', 'Consola analógica Behringer. (8 canales)', '1 Mic shure SV200.'],
      iluminacion: ['Luz general de las 2 arañas de techo'],
      escenario: ['piso de mosaico calcáreo', '3 puertas ventana para acceso a terraza'],
      extras: ['acceso por escalera, 1er piso']
    }
  }
];
