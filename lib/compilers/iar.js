// Copyright (c) 2016, Matt Godbolt
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
const path = require('path');
const fs = require('fs');
const BaseCompiler = require('../base-compiler');
const AsmParser = require('../asm-parser');

class IARAsmParser extends AsmParser {
    processAsm(asmResult, filters) {
        let currentSourceLine = 0;
        let asm = [];
        let labels = [];

        for( let asmLine of asmResult ) {
            let asmText = asmLine.text;
            let trimLine = asmText.trim();
            
            if( trimLine.startsWith('\\') ) {
                if( currentSourceLine != 0 ) {
                    trimLine = trimLine.substr(1).trim();
                    if( trimLine.startsWith("0x") ) {
                        // Instruction.
                        let splits = trimLine.split(' ').filter(val => val && !val.startsWith('0x'));
                        if( splits.length == 0 ) {
                            continue;
                        }

                        let newSplits = [];
                        newSplits.push(splits[0].padEnd(12, ' '));

                        let str = '';
                        for( let i = 1; i < splits.length; ++i ) {
                            if( !splits[i].startsWith(';') ) {
                                str += splits[i];
                            }
                            else if( str ) {
                                newSplits.push(str.padEnd(18, ' '));
                                newSplits.push(splits.splice(i).join(' '));
                                str = ''
                                break;
                            }
                        }
                        if( str ) {
                            newSplits.push(str);
                        }
                        trimLine = newSplits.filter(val => val).join(' ');
                        asmLine.text = `    ${trimLine}`;
                    }
                    else if( !trimLine.startsWith('In') && !trimLine.startsWith('__') ){
                        // Label
                        labels.push(trimLine.substr(0, trimLine.indexOf(':')));
                        asmLine.text = trimLine;
                    }
                    else {
                        continue;
                    }

                    asmLine.source = {
                        file: null,
                        line: currentSourceLine
                    }
                    asm.push(asmLine);
                }
            }
            else {
                // This is a source line of code.
                let firstSpace = trimLine.indexOf(' ');
                if( firstSpace > 0 ) {
                    let testIfNum = trimLine.substr(0, firstSpace);
                    if( !isNaN(testIfNum) ) {
                        trimLine = trimLine.substr(firstSpace).trim();
                        if( !trimLine.startsWith('//') && !trimLine.startsWith('/*') && !trimLine.startsWith('*') ) {
                            currentSourceLine = Number.parseInt(testIfNum);
                        }
                        else {
                            currentSourceLine = 0;
                        }
                    }
                }
            }
        }

        // Find label Locations
        for( let asmLine of asm ) {
            let asmText = asmLine.text;
            for( let label of labels ) {
                let finder = asmText.indexOf(label);
                if( finder >= 0 && asmText.indexOf(':') == -1 ) {
                    if( !asmLine.labels ) {
                        asmLine.labels = []
                    }
                    asmLine.labels.push({
                        name: label,
                        range: {
                            startCol: finder,
                            endCol: finder + label.length
                        }
                    })
                }
            }
        }

        return { asm, labelDefinitions: null };
    }
}


class IARCompiler extends BaseCompiler {
    constructor(compilerProps, env) {
        super(compilerProps, env);

        this.defaultAsm = this.asm;
        this.asm = new IARAsmParser(this._compilerProps);

    }
    optionsForFilter(filters, outputFilename) {
        const fname = this.filename(outputFilename);
        let options = ['-o', fname, '-lC', path.dirname(fname), '--dlib_config', "C:\\Program Files (x86)\\IAR Systems\\Embedded Workbench 8.3\\arm\\inc\\c\\DLib_Config_Full.h"];
        return options;
    }

    getOutputFilename(dirPath, outputFilebase) {
        // NB keep lower case as ldc compiler `tolower`s the output name
        return path.join(dirPath, `${outputFilebase}.o`);
    }

    async execPostProcess(result, postProcesses, outputFilename, maxSize) {
        const ppFile = outputFilename.replace('.o', '.lst');
        const contents = fs.readFileSync(ppFile);
        result.asm = contents.toString();

        return result;
    }

    processAsm(result, filters) {
        let { asm, labelDefinitions } = this.defaultAsm.process(result.asm, filters);

        let res = this.asm.process(asm, filters);
        return res;
    }

}

module.exports = IARCompiler;
