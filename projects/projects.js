import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('./lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
projectsTitle.textContent = `${projects.length} Projects`;

renderProjects(projects, projectsContainer, 'h2');

let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
let colors = d3.scaleOrdinal(d3.schemeTableau10);
let selectedIndex = -1;

function renderPieChart(projectsGiven) {
    // re-calculate rolled data
    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
        ).sort((a, b) => d3.ascending(a[0], b[0]));;
    // re-calculate data
    let data = rolledData.map(([year, count]) => {
        return { value: count, label: year };
    });

    // re-calculate slice generator, arc data, arc, etc.
    let sliceGenerator = d3.pie().value((d) => d.value);
    let arcData = sliceGenerator(data);
    let arcs = arcData.map((d) => arcGenerator(d));

    let total = 0;

    for (let d of data) {
    total += d;
    }

    let angle = 0;

    for (let d of data) {
    let endAngle = angle + (d / total) * 2 * Math.PI;
    arcData.push({ startAngle: angle, endAngle });
    angle = endAngle;
    }

    let legend = d3.select('.legend');
    let svg = d3.select('svg');
    arcs.forEach((arc, i) => {
    svg
        .append('path')
        .attr('d', arc)
        .attr('fill', colors(i))
        .on('click', () => {
            selectedIndex = selectedIndex === i ? -1 : i;
            svg
            .selectAll('path')
            .attr('class', (_, idx) => (
                idx === selectedIndex ? 'selected' : ''
            ));

            if (selectedIndex === -1) {
                renderProjects(projectsGiven, projectsContainer, 'h2');
            } else {
                const selectedYear = data[selectedIndex].label;
                // change made here, doesn't work if we call projects.filter instead of projectsGiven.filter
                const filteredProjects = projectsGiven.filter((project) => project.year === selectedYear);
                renderProjects(filteredProjects, projectsContainer, 'h2');
            }

            legend
            .selectAll('li')
            .attr('class', (_, idx) =>
            idx === selectedIndex ? 'selected' : 'legend-item'
            );
    });
});
data.forEach((d, idx) => {
    legend
        .append('li')
        .attr('style', `--color:${colors(idx)}`) // set the style attribute while passing in parameters
        .attr('class', 'legend-item')
        .html(`<span class="swatch"> </span> ${d.label} <em style="color: grey;">(${d.value})</em>`); // set the inner html of <li>
    })
  }
    
renderPieChart(projects);
let query = '';

let searchInput = document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {
    query = event.target.value;
// TODO: filter the projects
let filteredProjects = projects.filter((project) => {
    let values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
});
// TODO: render updated projects!
    renderProjects(filteredProjects, projectsContainer, 'h2');
    let newSVG = d3.select('svg');
    newSVG.selectAll('path').remove();
    let newLegends = d3.select('.legend');
    newLegends.selectAll('li').remove();
    renderPieChart(filteredProjects);
});
