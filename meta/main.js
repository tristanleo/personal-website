import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
      ...row,
      line: Number(row.line), // or just +row.line
      depth: Number(row.depth),
      length: Number(row.length),
      date: new Date(row.date + 'T00:00' + row.timezone),
      datetime: new Date(row.datetime),
    }));
    return data;
  }

function processCommits(data) {
    return d3
      .groups(data, (d) => d.commit)
      .map(([commit, lines]) => {
        let first = lines[0];
        let { author, date, time, timezone, datetime } = first;
        let ret = {
          id: commit,
          url: 'https://github.com/vis-society/lab-7/commit/' + commit,
          author,
          date,
          time,
          timezone,
          datetime,
          hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
          totalLines: lines.length,
        };
  
        Object.defineProperty(ret, 'lines', {
            value: lines,
            writable: true,
            configurable: true,
            enumerable: false
          });          
  
        return ret;
      });
}

function updateCommitInfo(data, commits) {
  const stats = document.getElementById("stats");
  // clear out old contents
  stats.innerHTML = "";

  // compute your metrics
  const totalLoc     = data.length;
  const totalCommits = commits.length;
  const uniqueFiles  = new Set(data.map(d => d.file)).size;
  const fileGroups   = d3.group(data, d => d.file);
  const avgLen       = Math.round(
    d3.mean(Array.from(fileGroups.values(), g => g.length))
  );
  const weekdays     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayCounts    = d3.rollup(data, v => v.length, d => new Date(d.date).getDay());
  const mostDay      = weekdays[d3.greatest(Array.from(dayCounts), d => d[1])[0]];

  // build a <dl> innerHTML in one go
  stats.innerHTML = `
    <dt>Total LOC</dt><dd>${totalLoc}</dd>
    <dt>Total commits</dt><dd>${totalCommits}</dd>
    <dt>Number of files</dt><dd>${uniqueFiles}</dd>
    <dt>Avg file length</dt><dd>${avgLen}</dd>
    <dt>Most active day</dt><dd>${mostDay}</dd>
  `;
}

let data = await loadData();
let commits = processCommits(data);
let filteredCommits = commits;
let commitProgress = 100;
let timeScale = d3.scaleTime(
  [d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)],
  [0, 100],
);
let commitMaxTime = timeScale.invert(commitProgress);
updateCommitInfo(data, commits);


function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  const time = document.getElementById('commit-time');
  const author = document.getElementById('commit-author');
  const lines = document.getElementById('commit-lines');

  if (Object.keys(commit).length === 0) return;

  link.href = commit.url;
  link.textContent = commit.id;

  const datetime = new Date(commit.datetime);
  date.textContent = datetime.toLocaleDateString('en', { dateStyle: 'full' });
  time.textContent = datetime.toLocaleTimeString('en');
  author.textContent = commit.author;
  lines.textContent = `${commit.totalLines} lines changed`;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

let xScale, yScale;

function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionCount(selection, commits) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  
    const countElement = document.querySelector('#selection-count');
    countElement.textContent = `${
      selectedCommits.length || 'No'
    } commits selected`;
  
    return selectedCommits;
  }

function renderLanguageBreakdown(selection, commits) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }
  const requiredCommits = selectedCommits.length ? selectedCommits : commits;
  const lines = requiredCommits.flatMap((d) => d.lines);

  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

function brushed(event, commits) {
  const selection = event.selection;
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d),
  );
  renderSelectionCount(selection, commits);
  renderLanguageBreakdown(selection, commits);
}

function renderScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
    
  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Add gridlines BEFORE the axes
  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  // Create gridlines as an axis with no labels and full-width ticks
  gridlines.call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  const [minLines, maxLines] = d3.extent(commits, d => d.totalLines);
  // rescaling the size of dots proportionately to #lines edited
  const rScale = d3
    .scaleSqrt() // Change only this line
    .domain([minLines, maxLines])
    .range([0, 40]);
  
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const dots = svg.append('g').attr('class', 'dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', d => rScale(d.totalLines))
    .style('fill-opacity', 0.7)
    .attr('fill', d => {
      const hour = new Date(d.datetime).getHours();
      return hour < 6 || hour >= 20 ? '#4682b4' : '#f4a261'; // blue for night, orange for day
    })
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
  });
    
  // Create the axes
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  // Add X axis
  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .attr("class", "x-axis")
    .call(xAxis);

  // Add Y axis
  svg
    .append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .attr("class", "y-axis")
    .call(yAxis);

  // Create brush
  svg.call(d3.brush().on('start brush end', (event) => brushed(event, commits)));

  // Raise dots and everything after overlay
  svg.selectAll('.dots, .overlay ~ *').raise();
}
renderScatterPlot(data, commits);

function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 20 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);

  const xAxis = d3.axisBottom(xScale);
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7) // Add transparency for overlapping dots
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1); // Full opacity on hover
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}
updateScatterPlot(data, commits);

const timeSlider = document.getElementById('progress-slider');
const selectedTime = document.getElementById('selectedTime');

function filterCommitsByTime() {
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
}

function updateTimeDisplay() {
  commitProgress = Number(timeSlider.value); // Get slider value
  commitMaxTime = timeScale.invert(commitProgress); // Update commitMaxTime based on slider value
  selectedTime.textContent = commitMaxTime.toLocaleString();
  filterCommitsByTime(); // filters by time and assign to some top-level variable.
  updateScatterPlot(data, filteredCommits);
  updateCommitInfo(data, filteredCommits); // Update commit info with filtered data
}

// timeSlider.addEventListener('input', updateTimeDisplay);
// function updateSliderBackground() {
//   timeSlider.style.setProperty('--progress', timeSlider.value);
// }
// timeSlider.addEventListener('input', updateSliderBackground);
// updateSliderBackground();
// updateTimeDisplay();


function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);
  let colors = d3.scaleOrdinal(d3.schemeTableau10);
  let files = d3
  .groups(lines, (d) => d.file)
  .map(([name, lines]) => {
    return { name, lines };
  })
  .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
  .select('#files')
  .selectAll('div')
  .data(files, (d) => d.name)
  .join(
    // This code only runs when the div is initially rendered
    (enter) =>
      enter.append('div').call((div) => {
        div.append('dt').call(dt => {
          dt.append('code');
          dt.append('small');
        });
        div.append('dd');
      }),
  ).attr('style', (d) => `--color: ${colors(d.type)}`);

  // This code updates the div info
  filesContainer
    .select('dt > code')
    .html((d) => d.name + '<small>' + d.lines.length + ' lines</small>');

  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);

    filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
    updateScatterPlot(data, filteredCommits);
};
updateFileDisplay(filteredCommits);

d3.select('#scatter-story')
.selectAll('.step')
.data(commits)
.join('div')
.attr('class', 'step')
.html(
  (d, i) => `
  On ${d.datetime.toLocaleString('en', {
    dateStyle: 'full',
    timeStyle: 'short',
  })},
  I made <a href="${d.url}" target="_blank">${
    i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
  }</a>.
  I edited ${d.totalLines} lines across ${
    d3.rollups(
      d.lines,
      (D) => D.length,
      (d) => d.file,
    ).length
  } files.
  Then I looked over all I had made, and I saw that it was very good.
`,
);

  function onStepEnter(response) {
    commitMaxTime = response.element.__data__.datetime;
    filterCommitsByTime();
    updateCommitInfo(data, filteredCommits);
    updateFileDisplay(filteredCommits);
    updateScatterPlot(data, filteredCommits);
    console.log(response.element.__data__.datetime);
  }
  
  const scroller = scrollama();
  scroller
  .setup({
    container: '#scrolly-1',
    step:      '#scrolly-1 .step',
    offset:    0.5,   // trigger when 50% of the step crosses the middle
    progress:  false, // we only care about enter/exit
  })
  .onStepEnter(onStepEnter)
  .onStepExit(response => {
    // if we’re leaving the very last step by scrolling down…
    if (response.index === commits.length - 1 && response.direction === 'down') {
      // re‑fire the same update that onStepEnter would have done
      onStepEnter(response);
    }
  });