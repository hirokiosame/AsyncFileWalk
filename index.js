const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const walk = require('walk');

class FileTraverser extends EventEmitter {

	constructor (opts) {
		super();

		assert(opts.inputs, 'You must provide at least one input');

		if (typeof opts.scopeTo === 'string') {
			this.scopeTo = new RegExp('^' + opts.scopeTo);
		}

		this.excludes = [];

		if (opts.excludes) {
			if (opts.excludes instanceof Array) {
				this.excludes.push(...opts.excludes);
			} else {
				this.excludes.push(opts.excludes);
			}
		}

		this.excludes = new Set(this.excludes.map(path.resolve));


		this.files = new Set();
		this.dirs = new Set();

		if (opts.inputs instanceof Array) {
			for (let input of opts.inputs) {
				if (typeof input === 'string') {
					this.add(input);
				}
			}
		} else {
			this.add(opts.inputs);
		}

		// List of traversed paths to avoid duplicates
		this.traversed = new Set();
	}

	add (inpPath) {

		inpPath = path.resolve(inpPath);

		let stat;

		try {
			stat = fs.lstatSync(inpPath);
		} catch (e) {}

		if (!stat) { return; }

		if (stat.isFile()) {
			this.files.add(inpPath);
		}

		if (stat.isDirectory()) {
			this.dirs.add(inpPath);
		}
	}

	traverse () {

		console.log('Traversing files:', this.files);
		console.log('Traversing directories:', this.dirs);

		setImmediate(() => {

			// Contains promises of files that are being handled
			this.handlingFiles = [];

			for (let file of this.files) {
				this.traverseFile(file);
			}

			let dirsTraversed = [];

			for (let dir of this.dirs) {
				dirsTraversed.push(new Promise((resolve, reject) => {
					this.traverseDir(dir, resolve, reject);
				}));
			}

			Promise.all(dirsTraversed)
			.then(() => {

				// Block from more being added
				Object.freeze(this.handlingFiles);

				return Promise.all(this.handlingFiles);
			})
			.then(() => this.emit('done'));
		});

		return this;
	}

	traverseDir (dirPath, resolve, reject) {
		walk.walk(dirPath)
		.on('file', (dir, fileInfo, next) => {

			dir = path.normalize(dir);

			let filePath = path.join(dir, fileInfo.name);

			this.traverseFile(filePath);

			next();
		})
		.on('errors', reject)
		.on('end', resolve);
	}

	traverseFile (filePath) {

		filePath = path.resolve(filePath);

		if (
			this.traversed.has(filePath) ||
			this.excludes.has(filePath) ||
			(this.scopeTo && !filePath.match(this.scopeTo))
		) { return; }

		this.traversed.add(filePath);


		let fileHandled = new Promise((resolve, reject) => {
			this.emit('file', filePath, resolve, reject);
		});

		this.handlingFiles.push(fileHandled);
	}
}

module.exports = FileTraverser;